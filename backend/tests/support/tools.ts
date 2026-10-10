import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import type { ToolPaths } from '../../src/media/processing/ffmpeg.js';

const exec = promisify(execFile);

/**
 * The ffmpeg and ffprobe used by tests. They come from dev-only npm packages (old,
 * GPL-licensed builds that must never be shipped); production uses the host's own,
 * patched binaries via FFMPEG_PATH / FFPROBE_PATH.
 */
export const TOOLS: ToolPaths = { ffmpeg: ffmpegInstaller.path, ffprobe: ffprobeInstaller.path };

export function scratchDir(prefix = 'blocks-media-test-'): { dir: string; remove(): void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A real, decodable still image (JPEG, PNG or WebP). */
export async function makeImage(
  path: string,
  o: { width?: number; height?: number; quality?: number } = {},
): Promise<void> {
  const { width = 640, height = 480 } = o;
  await exec(TOOLS.ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=${width}x${height}:rate=1`,
    '-frames:v',
    '1',
    ...(path.endsWith('.jpg') ? ['-q:v', String(o.quality ?? 3)] : []),
    '-y',
    path,
  ]);
}

/** A real short video with a moving picture and (optionally) a tone, in an MP4 container. */
export async function makeVideo(
  path: string,
  o: {
    width?: number;
    height?: number;
    seconds?: number;
    audio?: boolean;
    fps?: number;
    title?: string;
  } = {},
): Promise<void> {
  const { width = 640, height = 360, seconds = 2, audio = true, fps = 25 } = o;
  await exec(TOOLS.ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=${width}x${height}:rate=${fps}`,
    ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100'] : []),
    '-t',
    String(seconds),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    ...(audio ? ['-c:a', 'aac'] : []),
    ...(o.title
      ? ['-metadata', `title=${o.title}`, '-metadata', 'comment=GPS 17.3850 N 78.4867 E']
      : []),
    '-y',
    path,
  ]);
}

/** A plain tone as an audio-only MP4/AAC file. */
export async function makeAudio(path: string, seconds = 3): Promise<void> {
  await exec(TOOLS.ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=330:sample_rate=44100',
    '-t',
    String(seconds),
    '-c:a',
    'aac',
    '-y',
    path,
  ]);
}
