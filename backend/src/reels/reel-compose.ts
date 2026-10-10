import { type Matrix, colorMatrixFilter } from './reel-looks.js';

/** What every reel is rendered as: a 9:16 picture at 1080x1920 and 30 frames a second. */
export const OUT_WIDTH = 1080;
export const OUT_HEIGHT = 1920;
export const OUT_FPS = 30;
/** Length of the dip to black at a cut. It sits inside the clips either side, so it adds no time. */
export const FADE_SECONDS = 0.25;
/** Sources this close to 9:16 are cropped to fill; anything else is shown whole on a blurred copy of itself. */
const FILL_TOLERANCE = 0.2;
const TARGET_ASPECT = OUT_WIDTH / OUT_HEIGHT;

export interface ComposeClip {
  /** A local file that this process wrote (a processed rendition), never a client-supplied path. */
  path: string;
  /** The demuxer to insist on (`mov,mp4,...` for video, `image2` for photos). */
  demuxer: string;
  isPhoto: boolean;
  width: number;
  height: number;
  hasAudio: boolean;
  /** The part of the source that plays. For a photo, `startMs` is 0 and `endMs` is how long it is shown. */
  startMs: number;
  endMs: number;
  /** 0..1.5 */
  volume: number;
  matrix: Matrix | null;
  /** 0..1 */
  sharpness: number;
  /** 0..1 */
  vignette: number;
  /** What happens at the end of this clip going into the next one. */
  transitionOut: 'none' | 'fade';
}

export interface ComposeMusic {
  /** The full-length track, a local file this process wrote. */
  path: string;
  /** Where in the track to start, and how much of it to use. */
  startMs: number;
  endMs: number;
  /** 0..1 */
  volume: number;
}

export interface ComposePlan {
  clips: readonly ComposeClip[];
  music?: ComposeMusic | null | undefined;
}

export const clipLengthMs = (c: Pick<ComposeClip, 'startMs' | 'endMs'>): number =>
  c.endMs - c.startMs;

export const planDurationMs = (plan: ComposePlan): number =>
  plan.clips.reduce((sum, c) => sum + clipLengthMs(c), 0);

const sec = (ms: number): string => (Math.round(ms) / 1000).toFixed(3);
const n = (v: number): string => (Math.round(v * 10_000) / 10_000).toString();

/** Crop to fill when the source is nearly 9:16; otherwise fit it inside, over a blurred copy of itself. */
function fitFilters(i: number, c: ComposeClip): string[] {
  const aspect = c.width / c.height;
  if (Math.abs(aspect / TARGET_ASPECT - 1) <= FILL_TOLERANCE) {
    return [
      `[${i}:v]scale=${OUT_WIDTH}:${OUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUT_WIDTH}:${OUT_HEIGHT}`,
    ];
  }
  return [
    `[${i}:v]split[bg${i}in][fg${i}in]`,
    `[bg${i}in]scale=${OUT_WIDTH}:${OUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUT_WIDTH}:${OUT_HEIGHT},boxblur=24:6[bg${i}]`,
    `[fg${i}in]scale=${OUT_WIDTH}:${OUT_HEIGHT}:force_original_aspect_ratio=decrease[fg${i}]`,
    `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2`,
  ];
}

/**
 * The one ffmpeg command that turns the creator's timeline into a finished 9:16 video.
 *
 * Every number in the command is computed here from validated values; no text a person
 * typed reaches it, and the only strings that are paths are files this process wrote.
 * That is what makes it safe to run: there is nothing to inject into.
 *
 * What it does, per clip: take the chosen part, fit it to 1080x1920 (crop to fill, or sit
 * on a blurred copy), apply the colour look and sharpening / vignette, and dip to black at
 * a faded cut. Then it joins the clips, mixes in the chosen part of a music track under
 * the clips' own sound, and encodes H.264 + AAC with all metadata removed. Photos are held
 * for their chosen time. A clip with no sound contributes silence, so the sound never
 * drifts from the picture.
 */
export function composeArgs(
  plan: ComposePlan,
  output: string,
  limits: { maxBytes: number } = { maxBytes: 400 * 1024 * 1024 },
): { args: string[]; durationMs: number } {
  const { clips } = plan;
  if (clips.length === 0) throw new RangeError('a reel needs at least one clip');
  for (const c of clips) {
    if (!(c.endMs > c.startMs) || c.startMs < 0) throw new RangeError('a clip has no length');
  }
  const durationMs = planDurationMs(plan);

  const inputs: string[] = [];
  const parts: string[] = [];
  const joined: string[] = [];

  clips.forEach((c, i) => {
    const length = clipLengthMs(c);
    // Input options precede `-i`. Only local files may be opened.
    inputs.push('-protocol_whitelist', 'file');
    if (c.isPhoto) {
      inputs.push(
        '-loop',
        '1',
        '-framerate',
        String(OUT_FPS),
        '-t',
        sec(length),
        '-f',
        c.demuxer,
        '-i',
        c.path,
      );
    } else {
      inputs.push('-ss', sec(c.startMs), '-t', sec(length), '-f', c.demuxer, '-i', c.path);
    }

    // ---- picture
    const fadeLen = Math.min(FADE_SECONDS, length / 2000);
    const fadeOut = c.transitionOut === 'fade' && i < clips.length - 1;
    const fadeIn = i > 0 && clips[i - 1]?.transitionOut === 'fade';
    const after = [
      ...(c.matrix ? [colorMatrixFilter(c.matrix)] : []),
      ...(c.sharpness > 0 ? [`unsharp=5:5:${n(1.5 * c.sharpness)}:5:5:0`] : []),
      ...(c.vignette > 0
        ? [`vignette=angle=${n(Math.PI / 2 - c.vignette * (Math.PI / 2 - Math.PI / 6))}`]
        : []),
      `setsar=1`,
      `fps=${OUT_FPS}`,
      `format=yuv420p`,
      ...(fadeIn ? [`fade=t=in:st=0:d=${n(fadeLen)}`] : []),
      ...(fadeOut ? [`fade=t=out:st=${n(length / 1000 - fadeLen)}:d=${n(fadeLen)}`] : []),
      `setpts=PTS-STARTPTS`,
    ];
    const fit = fitFilters(i, c);
    const last = fit.length - 1;
    fit.forEach((f, k) => parts.push(k === last ? `${f},${after.join(',')}[v${i}]` : f));

    // ---- sound
    const volume = Math.min(Math.max(c.volume, 0), 1.5);
    if (c.hasAudio && !c.isPhoto) {
      parts.push(
        `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(volume)},apad,atrim=duration=${sec(length)},asetpts=PTS-STARTPTS[a${i}]`,
      );
    } else {
      parts.push(
        `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${sec(length)},asetpts=PTS-STARTPTS[a${i}]`,
      );
    }
    joined.push(`[v${i}][a${i}]`);
  });

  const music = plan.music;
  parts.push(`${joined.join('')}concat=n=${clips.length}:v=1:a=1[vout][acat]`);
  if (music) {
    const m = clips.length;
    const useMs = Math.min(music.endMs - music.startMs, durationMs);
    if (!(useMs > 0) || music.startMs < 0) throw new RangeError('the music window has no length');
    inputs.push(
      '-protocol_whitelist',
      'file',
      '-ss',
      sec(music.startMs),
      '-t',
      sec(useMs),
      '-f',
      'mov,mp4,m4a,3gp,3g2,mj2',
      '-i',
      music.path,
    );
    const tail = Math.min(1, useMs / 1000);
    parts.push(
      `[${m}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${n(Math.min(Math.max(music.volume, 0), 1))},afade=t=out:st=${n(useMs / 1000 - tail)}:d=${n(tail)},apad,atrim=duration=${sec(durationMs)}[music]`,
      // amix halves each input to avoid clipping; the volume step puts the levels back, the limiter catches peaks.
      `[acat][music]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95[aout]`,
    );
  } else {
    parts.push(`[acat]anull[aout]`);
  }

  const args = [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputs,
    '-filter_complex',
    parts.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-map_metadata',
    '-1',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'high',
    '-crf',
    '22',
    '-maxrate',
    '6000k',
    '-bufsize',
    '12000k',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(OUT_FPS),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-t',
    sec(durationMs),
    '-threads',
    '2',
    '-fs',
    String(limits.maxBytes),
    '-y',
    output,
  ];
  return { args, durationMs };
}
