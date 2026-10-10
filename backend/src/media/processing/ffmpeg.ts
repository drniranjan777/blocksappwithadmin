import { spawn } from 'node:child_process';

export class MediaToolError extends Error {
  constructor(
    message: string,
    /** True when running it again cannot help (the file itself is the problem). */
    readonly permanent: boolean,
    readonly code: string,
  ) {
    super(message);
  }
}

export interface ToolPaths {
  ffmpeg: string;
  ffprobe: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Runs an external program with an argument list (never a shell string), a time
 * limit, and bounded output. Arguments are never built from user text: file paths are
 * ones we created and options are constants, so there is nothing to inject into.
 */
function run(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<RunResult & { code: number | null; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const started = Date.now();
    const name = bin.split(/[\\/]/).pop() ?? bin;
    if (TRACE) {
      process.stderr.write(
        `[tool ${new Date().toISOString().slice(11, 23)}] start ${name} pid=${child.pid} limit=${timeoutMs}ms\n`,
      );
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const cap = (s: string, add: Buffer) => (s.length > 200_000 ? s : s + add.toString('utf8'));
    child.stdout.on('data', (d: Buffer) => (stdout = cap(stdout, d)));
    child.stderr.on('data', (d: Buffer) => (stderr = cap(stderr, d)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        new MediaToolError(`could not start ${bin}: ${error.message}`, false, 'TOOL_UNAVAILABLE'),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (TRACE) {
        process.stderr.write(
          `[tool ${new Date().toISOString().slice(11, 23)}] end   ${name} pid=${child.pid} code=${code} in ${Date.now() - started}ms${timedOut ? ' TIMED OUT' : ''}\n`,
        );
      }
      resolve({ stdout, stderr, code, timedOut });
    });
  });
}

/** Debugging aid, off unless `MEDIA_TRACE=1`: when each external program starts and ends. */
const TRACE = process.env['MEDIA_TRACE'] === '1';

export interface ProbeResult {
  format: string;
  durationMs: number;
  bitrateKbps: number | null;
  video: { codec: string; width: number; height: number; fps: number; rotation: number } | null;
  audio: { codec: string } | null;
  streamCount: number;
}

function fraction(text: string | undefined): number {
  if (!text) return 0;
  const [a, b] = text.split('/').map(Number);
  return b ? (a ?? 0) / b : (a ?? 0);
}

/** Facts about a media file, from ffprobe. A file it cannot read is a permanent failure. */
export async function probe(
  tools: ToolPaths,
  path: string,
  forceFormat?: string,
): Promise<ProbeResult> {
  const args = [
    '-v',
    'error',
    '-protocol_whitelist',
    'file',
    ...(forceFormat ? ['-f', forceFormat] : []),
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    path,
  ];
  const res = await run(tools.ffprobe, args, 30_000);
  if (res.timedOut) throw new MediaToolError('probing took too long', false, 'PROBE_TIMEOUT');
  if (res.code !== 0) {
    throw new MediaToolError(
      `unreadable media: ${res.stderr.slice(0, 300)}`,
      true,
      'CORRUPT_MEDIA',
    );
  }
  let json: {
    format?: { format_name?: string; duration?: string; bit_rate?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      duration?: string;
      tags?: Record<string, string>;
      side_data_list?: Array<{ rotation?: number }>;
    }>;
  };
  try {
    json = JSON.parse(res.stdout) as typeof json;
  } catch {
    throw new MediaToolError('unreadable media: bad probe output', true, 'CORRUPT_MEDIA');
  }
  const streams = json.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  const duration = Number(json.format?.duration ?? v?.duration ?? 0);
  const rotationTag = Number(v?.tags?.['rotate'] ?? v?.side_data_list?.[0]?.rotation ?? 0);
  return {
    format: json.format?.format_name ?? 'unknown',
    durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : 0,
    bitrateKbps: json.format?.bit_rate ? Math.round(Number(json.format.bit_rate) / 1000) : null,
    video: v
      ? {
          codec: v.codec_name ?? 'unknown',
          width: v.width ?? 0,
          height: v.height ?? 0,
          fps: fraction(v.avg_frame_rate) || fraction(v.r_frame_rate),
          rotation: Math.abs(rotationTag) % 360,
        }
      : null,
    audio: a ? { codec: a.codec_name ?? 'unknown' } : null,
    streamCount: streams.length,
  };
}

/**
 * Safety options on every ffmpeg run.
 *
 *  - `GLOBAL`: no stdin, no interaction, quiet.
 *  - `INPUT_ONLY_FILES`: **only local files** may be opened, so a crafted file cannot make
 *    ffmpeg fetch a URL or follow a playlist (the classic server-side request forgery
 *    against media tools). It is an input option and goes before `-i`.
 *  - `outputLimit`: an output size ceiling, so a decompression bomb cannot fill the disk.
 *    It is an output option and goes right before the output file.
 */
const GLOBAL = ['-nostdin', '-hide_banner', '-loglevel', 'error'];
const INPUT_ONLY_FILES = ['-protocol_whitelist', 'file'];
const outputLimit = (bytes: number): string[] => ['-fs', String(bytes)];

/**
 * How long one video encode may run before it is killed and tried again: a minute plus twenty times the
 * length of the video, never less than two minutes or more than fifteen. A fixed fifteen minutes would let
 * a stalled encode of a two-second clip hold a worker for a quarter of an hour; this lets it be retried
 * in two, while a long video still gets all the time it can need.
 */
export function encodeLimitMs(durationMs: number): number {
  const wanted = 60_000 + 20 * Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  return Math.min(15 * 60_000, Math.max(2 * 60_000, wanted));
}

export async function ffmpeg(tools: ToolPaths, args: string[], timeoutMs: number): Promise<void> {
  const res = await run(tools.ffmpeg, args, timeoutMs);
  if (res.timedOut)
    throw new MediaToolError('processing took too long', false, 'PROCESSING_TIMEOUT');
  if (res.code !== 0) {
    const detail = res.stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 400);
    // A decode error on the input is the file's fault; anything else may pass on a retry.
    const bad =
      /Invalid data found|moov atom not found|Error while decoding|could not find codec|Invalid argument/i.test(
        detail,
      );
    throw new MediaToolError(
      `ffmpeg failed: ${detail}`,
      bad,
      bad ? 'CORRUPT_MEDIA' : 'PROCESSING_FAILED',
    );
  }
}

// ---------------------------------------------------------------------------
// Command lines. Pure functions so they can be read and tested without running anything.
// ---------------------------------------------------------------------------

export interface VideoProfile {
  key: 'DATA_SAVER' | 'BALANCED' | 'HIGH';
  /** The shorter side is scaled down to at most this many pixels. */
  shortSide: number;
  crf: number;
  maxrateKbps: number;
  audioKbps: number;
}

export const VIDEO_PROFILES: readonly VideoProfile[] = [
  { key: 'DATA_SAVER', shortSide: 480, crf: 29, maxrateKbps: 700, audioKbps: 64 },
  { key: 'BALANCED', shortSide: 720, crf: 25, maxrateKbps: 2500, audioKbps: 96 },
  { key: 'HIGH', shortSide: 1080, crf: 22, maxrateKbps: 5000, audioKbps: 128 },
];

/** Which profiles are worth making for a source: never upscale. HIGH only for HD sources. */
export function profilesFor(width: number, height: number): VideoProfile[] {
  const short = Math.min(width, height);
  return VIDEO_PROFILES.filter((p) => p.key !== 'HIGH' || short >= 1000);
}

/** `scale` that limits the *shorter* side, keeps the aspect ratio and keeps both dimensions even (H.264 needs that). */
function scaleFilter(shortSide: number): string {
  return `scale=w='if(gte(iw\\,ih)\\,-2\\,min(iw\\,${shortSide}))':h='if(gte(iw\\,ih)\\,min(ih\\,${shortSide})\\,-2)'`;
}

export function videoArgs(
  input: string,
  output: string,
  profile: VideoProfile,
  opts: { hasAudio: boolean; forceFormat: string; capFps: boolean },
): string[] {
  const filters = [
    scaleFilter(profile.shortSide),
    ...(opts.capFps ? ['fps=30'] : []),
    'format=yuv420p',
  ];
  return [
    ...GLOBAL,
    ...INPUT_ONLY_FILES,
    '-f',
    opts.forceFormat,
    '-i',
    input,
    '-map',
    '0:v:0',
    ...(opts.hasAudio ? ['-map', '0:a:0'] : []),
    '-map_metadata',
    '-1',
    '-vf',
    filters.join(','),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-crf',
    String(profile.crf),
    '-maxrate',
    `${profile.maxrateKbps}k`,
    '-bufsize',
    `${profile.maxrateKbps * 2}k`,
    ...(opts.hasAudio ? ['-c:a', 'aac', '-b:a', `${profile.audioKbps}k`, '-ac', '2'] : ['-an']),
    '-movflags',
    '+faststart',
    '-threads',
    '2',
    ...outputLimit(400 * 1024 * 1024),
    '-y',
    output,
  ];
}

export function posterArgs(
  input: string,
  output: string,
  atSeconds: number,
  width: number,
  forceFormat: string,
): string[] {
  return [
    ...GLOBAL,
    ...INPUT_ONLY_FILES,
    '-ss',
    String(atSeconds),
    '-f',
    forceFormat,
    '-i',
    input,
    '-frames:v',
    '1',
    '-map_metadata',
    '-1',
    '-vf',
    `scale=w='min(iw\\,${width})':h=-2,format=yuvj420p`,
    '-q:v',
    '4',
    ...outputLimit(20 * 1024 * 1024),
    '-y',
    output,
  ];
}

/** An image re-encoded as a plain JPEG with no metadata (no EXIF, no GPS). */
export function imageArgs(
  input: string,
  output: string,
  maxLongSide: number,
  inputFormat: string,
): string[] {
  return [
    ...GLOBAL,
    ...INPUT_ONLY_FILES,
    '-f',
    inputFormat,
    '-i',
    input,
    '-frames:v',
    '1',
    '-map_metadata',
    '-1',
    '-vf',
    `scale=w='if(gte(iw\\,ih)\\,min(iw\\,${maxLongSide})\\,-2)':h='if(gte(iw\\,ih)\\,-2\\,min(ih\\,${maxLongSide}))',format=yuvj420p`,
    '-q:v',
    '3',
    ...outputLimit(60 * 1024 * 1024),
    '-y',
    output,
  ];
}

/** The demuxer to insist on, instead of letting ffmpeg guess from the content. */
export function demuxerFor(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
    case 'image/png':
    case 'image/webp':
      return 'image2';
    case 'video/webm':
      return 'matroska,webm';
    default:
      return 'mov,mp4,m4a,3gp,3g2,mj2';
  }
}

/** The demuxer for an audio file, chosen from its verified type. */
export function audioDemuxerFor(mime: string): string {
  switch (mime) {
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
      return 'wav';
    case 'audio/flac':
      return 'flac';
    case 'audio/ogg':
      return 'ogg';
    default:
      return 'mov,mp4,m4a,3gp,3g2,mj2';
  }
}

/**
 * Audio re-encoded as stereo AAC in an MP4 container with no metadata and no cover art
 * (`-vn`). With `fadeOutSeconds` the end fades out, so a preview does not stop abruptly.
 */
export function audioArgs(
  input: string,
  output: string,
  o: {
    demuxer: string;
    kbps: number;
    startSeconds?: number;
    seconds?: number;
    fadeOutSeconds?: number;
  },
): string[] {
  const filters = [
    'aresample=44100',
    ...(o.fadeOutSeconds && o.seconds
      ? [`afade=t=out:st=${Math.max(0, o.seconds - o.fadeOutSeconds)}:d=${o.fadeOutSeconds}`]
      : []),
  ];
  return [
    ...GLOBAL,
    ...INPUT_ONLY_FILES,
    ...(o.startSeconds ? ['-ss', String(o.startSeconds)] : []),
    '-f',
    o.demuxer,
    '-i',
    input,
    ...(o.seconds ? ['-t', String(o.seconds)] : []),
    '-vn',
    '-map',
    '0:a:0',
    '-map_metadata',
    '-1',
    '-af',
    filters.join(','),
    '-c:a',
    'aac',
    '-b:a',
    `${o.kbps}k`,
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    ...outputLimit(60 * 1024 * 1024),
    '-y',
    output,
  ];
}
