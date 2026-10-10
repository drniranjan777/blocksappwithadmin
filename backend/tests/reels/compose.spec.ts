import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ffmpeg, probe } from '../../src/media/processing/ffmpeg.js';
import { type ComposeClip, composeArgs, planDurationMs } from '../../src/reels/reel-compose.js';
import {
  ADJUSTMENT_RANGES,
  FILTER_IDS,
  FILTERS,
  IDENTITY,
  NEUTRAL,
  colorMatrixFilter,
  isIdentity,
  lookMatrix,
  renderedTransition,
} from '../../src/reels/reel-looks.js';
import { makeAudio, makeImage, makeVideo, scratchDir, TOOLS } from '../support/tools.js';

// Each of these renders real video, several times over.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const exec = promisify(execFile);
const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';

describe('reel looks', () => {
  it('has the same filters as the app, and "original" does nothing', () => {
    expect(FILTER_IDS).toEqual([
      'original',
      'vivid',
      'warm',
      'cool',
      'cinematic',
      'portrait',
      'vintage',
      'bw',
      'golden',
      'india',
      'urban',
      'food',
      'travel',
      'night',
    ]);
    expect(lookMatrix('original', 1, NEUTRAL)).toBeNull();
    expect(lookMatrix(null, 1, NEUTRAL)).toBeNull();
    // A filter at no strength is no filter.
    expect(lookMatrix('vivid', 0, NEUTRAL)).toBeNull();
    // An unknown id does nothing rather than failing: the service rejects it earlier.
    expect(lookMatrix('nope', 1, NEUTRAL)).toBeNull();
  });

  it('blends a filter in proportion to its strength', () => {
    const full = lookMatrix('vivid', 1, NEUTRAL)!;
    const half = lookMatrix('vivid', 0.5, NEUTRAL)!;
    full.forEach((v, i) => expect(half[i]).toBeCloseTo((IDENTITY[i]! + v) / 2, 9));
    // Out-of-range strengths are held to 0..1.
    expect(lookMatrix('vivid', 7, NEUTRAL)).toEqual(full);
    expect(lookMatrix('vivid', -3, NEUTRAL)).toBeNull();
  });

  it('applies the manual adjustments after the filter', () => {
    const adjusted = lookMatrix('original', 1, { ...NEUTRAL, brightness: 0.5 })!;
    expect(isIdentity(adjusted)).toBe(false);
    const both = lookMatrix('warm', 1, { ...NEUTRAL, brightness: 0.5 })!;
    expect(both).not.toEqual(lookMatrix('warm', 1, NEUTRAL));
    // Sharpness and vignette are not colour: they change nothing in the matrix.
    expect(lookMatrix('original', 1, { ...NEUTRAL, sharpness: 1, vignette: 1 })).toBeNull();
  });

  it('knows the range of every adjustment', () => {
    expect(Object.keys(ADJUSTMENT_RANGES).sort()).toEqual(Object.keys(NEUTRAL).sort());
  });

  it('turns every catalogue look into a filter made only of numbers', () => {
    for (const id of FILTER_IDS.filter((x) => x !== 'original')) {
      const m = lookMatrix(id, 1, NEUTRAL)!;
      const filter = colorMatrixFilter(m);
      expect(filter, id).toMatch(
        /^format=gbrp,colorchannelmixer=(?:[a-z]{2}=-?[\d.]+:?){9},lutrgb=.+,format=yuv420p$/,
      );
      // Coefficients stay inside what the filter accepts.
      for (const [, v] of filter.matchAll(/\b[rgb][rgb]=(-?[\d.]+)/g))
        expect(Math.abs(Number(v))).toBeLessThanOrEqual(2);
    }
    expect(Object.keys(FILTERS)).toHaveLength(14);
  });

  it('renders "none" and "fade" as asked, and the moving transitions as a fade', () => {
    expect(renderedTransition(null)).toBe('none');
    expect(renderedTransition('none')).toBe('none');
    expect(renderedTransition('fade')).toBe('fade');
    for (const id of ['slide', 'zoom', 'wipe']) expect(renderedTransition(id)).toBe('fade');
  });
});

describe('assembling a reel (real ffmpeg)', () => {
  const dir = scratchDir('blocks-compose-');
  const f = (n: string) => join(dir.dir, n);
  let counter = 0;

  const clip = (
    path: string,
    over: Partial<ComposeClip> & { w: number; h: number; photo?: boolean },
  ): ComposeClip => ({
    path,
    demuxer: over.photo ? 'image2' : MP4,
    isPhoto: over.photo ?? false,
    width: over.w,
    height: over.h,
    hasAudio: over.hasAudio ?? false,
    startMs: 0,
    endMs: 1000,
    volume: 1,
    matrix: null,
    sharpness: 0,
    vignette: 0,
    transitionOut: 'none',
    ...over,
  });

  const render = async (
    clips: ComposeClip[],
    music?: Parameters<typeof composeArgs>[0]['music'],
  ) => {
    const out = f(`out-${++counter}.mp4`);
    const { args, durationMs } = composeArgs({ clips, music }, out);
    await ffmpeg(TOOLS, args, 120_000);
    return { out, durationMs, facts: await probe(TOOLS, out, MP4) };
  };

  const meanVolume = async (path: string): Promise<number> => {
    const res = await exec(TOOLS.ffmpeg, [
      '-nostdin',
      '-i',
      path,
      '-vn',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ]).catch((e) => e as { stderr: string });
    const m = /mean_volume: (-?[\d.]+|-inf) dB/.exec(res.stderr);
    return m ? Number(m[1]) : Number.NaN;
  };

  /** The average colour of the frame at `atSeconds`, as [r, g, b]. */
  const colourAt = async (path: string, atSeconds: number): Promise<[number, number, number]> => {
    const { stdout } = await exec(
      TOOLS.ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-ss',
        String(atSeconds),
        '-i',
        path,
        '-frames:v',
        '1',
        '-vf',
        'scale=8:8',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-',
      ],
      { encoding: 'buffer', maxBuffer: 1 << 20 },
    );
    const sum = [0, 0, 0];
    for (let i = 0; i < stdout.length; i += 3)
      for (let c = 0; c < 3; c++) sum[c]! += stdout[i + c]!;
    const px = stdout.length / 3;
    return [sum[0]! / px, sum[1]! / px, sum[2]! / px];
  };

  beforeAll(async () => {
    await makeVideo(f('portrait.mp4'), { width: 720, height: 1280, seconds: 4, audio: true });
    await makeVideo(f('landscape.mp4'), { width: 1280, height: 720, seconds: 3, audio: false });
    await makeImage(f('photo.png'), { width: 640, height: 480 });
    await makeAudio(f('song.m4a'), 8);
    // A flat colour, so a look or a fade can be read straight from the pixels.
    await exec(TOOLS.ffmpeg, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=0xC86432:s=360x640:r=30:d=3',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-y',
      f('orange.mp4'),
    ]);
    await exec(TOOLS.ffmpeg, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x808080:s=360x640:r=30:d=3',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-y',
      f('grey.mp4'),
    ]);
  }, 120_000);
  afterAll(() => dir.remove());

  it('trims, fits to 1080x1920 at 30 fps, and joins clips and a photo to the exact length', async () => {
    const { facts, durationMs } = await render([
      clip(f('portrait.mp4'), { w: 720, h: 1280, hasAudio: true, startMs: 1000, endMs: 3000 }), // 2 s of a 4 s clip
      clip(f('landscape.mp4'), { w: 1280, h: 720 }), //                                           1 s, no sound
      clip(f('photo.png'), { w: 640, h: 480, photo: true, endMs: 1500 }), //                        held 1.5 s
    ]);
    expect(durationMs).toBe(4500);
    expect(facts.video).toMatchObject({ codec: 'h264', width: 1080, height: 1920 });
    expect(Math.round(facts.video!.fps)).toBe(30);
    expect(facts.audio).toBeTruthy();
    expect(Math.abs(facts.durationMs - 4500)).toBeLessThan(120);
  });

  it('keeps sound in step with the picture when some clips have none', async () => {
    const { out } = await render([
      clip(f('landscape.mp4'), { w: 1280, h: 720, endMs: 2000 }), // silent
      clip(f('portrait.mp4'), { w: 720, h: 1280, hasAudio: true, endMs: 2000 }),
    ]);
    const v = await probe(TOOLS, out, MP4);
    const { stdout } = await exec(TOOLS.ffprobe, [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,duration',
      '-of',
      'csv=p=0',
      out,
    ]);
    const durations = Object.fromEntries(
      stdout
        .trim()
        .split('\n')
        .map((l) => l.split(',') as [string, string]),
    );
    expect(Math.abs(Number(durations.audio) - Number(durations.video))).toBeLessThan(0.15);
    expect(Math.abs(v.durationMs - 4000)).toBeLessThan(150);
  });

  it('mixes a music track under the clips, and a photo-only reel is silent without it', async () => {
    const photo = () => clip(f('photo.png'), { w: 640, h: 480, photo: true, endMs: 3000 });
    const silent = await render([photo()]);
    expect(await meanVolume(silent.out)).toBeLessThan(-80);

    const withMusic = await render([photo()], {
      path: f('song.m4a'),
      startMs: 1000,
      endMs: 5000,
      volume: 0.8,
    });
    expect(await meanVolume(withMusic.out)).toBeGreaterThan(-35);
    expect(Math.abs(withMusic.facts.durationMs - 3000)).toBeLessThan(120);

    // The track is cut to the reel, and a short window is padded with silence rather than looped.
    const short = await render([photo()], {
      path: f('song.m4a'),
      startMs: 0,
      endMs: 1000,
      volume: 1,
    });
    expect(Math.abs(short.facts.durationMs - 3000)).toBeLessThan(120);
  });

  it('plays the clips louder or quieter by their volume, and mutes at 0', async () => {
    const loud = await render([
      clip(f('portrait.mp4'), { w: 720, h: 1280, hasAudio: true, endMs: 2000, volume: 1 }),
    ]);
    const quiet = await render([
      clip(f('portrait.mp4'), { w: 720, h: 1280, hasAudio: true, endMs: 2000, volume: 0.25 }),
    ]);
    const mute = await render([
      clip(f('portrait.mp4'), { w: 720, h: 1280, hasAudio: true, endMs: 2000, volume: 0 }),
    ]);
    const [l, q, m] = [
      await meanVolume(loud.out),
      await meanVolume(quiet.out),
      await meanVolume(mute.out),
    ];
    expect(l - q).toBeGreaterThan(8);
    expect(m).toBeLessThan(-80);
  });

  it('dips to black at a faded cut but not at a plain one, without changing the length', async () => {
    const run = async (transitionOut: 'none' | 'fade') =>
      render([
        clip(f('grey.mp4'), { w: 360, h: 640, endMs: 2000, transitionOut }),
        clip(f('grey.mp4'), { w: 360, h: 640, endMs: 2000 }),
      ]);
    const plain = await run('none');
    const faded = await run('fade');
    expect(Math.abs(plain.facts.durationMs - faded.facts.durationMs)).toBeLessThan(80);
    // Just before the cut at 2 s.
    const [plainR] = await colourAt(plain.out, 1.97);
    const [fadedR] = await colourAt(faded.out, 1.97);
    expect(plainR).toBeGreaterThan(110);
    expect(fadedR).toBeLessThan(40);
    // And well clear of it the picture is untouched.
    expect((await colourAt(faded.out, 1.0))[0]).toBeGreaterThan(110);
    // The last clip's own "fade" has nothing to fade into.
    const lastOnly = await render([
      clip(f('grey.mp4'), { w: 360, h: 640, endMs: 2000, transitionOut: 'fade' }),
    ]);
    expect((await colourAt(lastOnly.out, 1.9))[0]).toBeGreaterThan(110);
  });

  it('applies a colour look to the pixels', async () => {
    const colour = async (id: string | null, intensity = 1) =>
      colourAt(
        (
          await render([
            clip(f('orange.mp4'), {
              w: 360,
              h: 640,
              endMs: 1000,
              matrix: id ? lookMatrix(id, intensity, NEUTRAL) : null,
            }),
          ])
        ).out,
        0.5,
      );
    const [r0, g0, b0] = await colour(null);
    // The test colour (200, 100, 50) survives the encode and the conversions.
    expect(Math.abs(r0 - 200)).toBeLessThan(12);
    expect(Math.abs(g0 - 100)).toBeLessThan(12);
    expect(Math.abs(b0 - 50)).toBeLessThan(12);

    const [rb, gb, bb] = await colour('bw');
    expect(Math.max(rb, gb, bb) - Math.min(rb, gb, bb)).toBeLessThan(10);

    const warm = await colour('warm');
    const cool = await colour('cool');
    expect(warm[0] - warm[2]).toBeGreaterThan(cool[0] - cool[2] + 20);

    // Half strength is between none and full.
    const half = await colour('bw', 0.5);
    const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
    expect(spread(half)).toBeGreaterThan(spread([rb, gb, bb]) + 20);
    expect(spread(half)).toBeLessThan(spread([r0, g0, b0]) - 20);
  });

  it('shows a landscape picture whole over a blurred copy, and fills with a near-portrait one', async () => {
    // A flat colour has no edges, so use the test pattern and look at where the picture is.
    const wide = await render([clip(f('landscape.mp4'), { w: 1280, h: 720, endMs: 1000 })]);
    const filled = await render([clip(f('portrait.mp4'), { w: 720, h: 1280, endMs: 1000 })]);
    expect(wide.facts.video).toMatchObject({ width: 1080, height: 1920 });
    expect(filled.facts.video).toMatchObject({ width: 1080, height: 1920 });
    // The rows at the very top of the blurred background are not black bars.
    const top = await exec(
      TOOLS.ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        wide.out,
        '-frames:v',
        '1',
        '-vf',
        'crop=1080:40:0:0,scale=1:1',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-',
      ],
      { encoding: 'buffer' },
    );
    expect(Math.max(...top.stdout)).toBeGreaterThan(30);
  });

  it('can sharpen and vignette without breaking the render', async () => {
    const { facts } = await render([
      clip(f('portrait.mp4'), {
        w: 720,
        h: 1280,
        endMs: 1500,
        sharpness: 1,
        vignette: 1,
        matrix: lookMatrix('cinematic', 1, NEUTRAL),
      }),
    ]);
    expect(facts.video).toMatchObject({ width: 1080, height: 1920 });
  });

  it('strips all metadata from the result', async () => {
    await makeVideo(f('tagged.mp4'), {
      width: 360,
      height: 640,
      seconds: 2,
      title: 'SECRET-LOCATION-TITLE',
    });
    const { out } = await render([clip(f('tagged.mp4'), { w: 360, h: 640, endMs: 1500 })]);
    const { stdout } = await exec(TOOLS.ffprobe, [
      '-v',
      'error',
      '-show_entries',
      'format_tags:stream_tags',
      '-of',
      'json',
      out,
    ]);
    expect(stdout).not.toMatch(/SECRET|GPS|17\.38/);
  });

  it('refuses to build a command for an empty or backwards plan', () => {
    expect(() => composeArgs({ clips: [] }, 'x.mp4')).toThrow(RangeError);
    expect(() =>
      composeArgs({ clips: [clip('a.mp4', { w: 1, h: 1, startMs: 500, endMs: 500 })] }, 'x.mp4'),
    ).toThrow(RangeError);
    expect(() =>
      composeArgs(
        {
          clips: [clip('a.mp4', { w: 1, h: 1 })],
          music: { path: 'm.m4a', startMs: 900, endMs: 900, volume: 1 },
        },
        'x.mp4',
      ),
    ).toThrow(RangeError);
    expect(
      planDurationMs({
        clips: [
          clip('a', { w: 1, h: 1, endMs: 700 }),
          clip('b', { w: 1, h: 1, startMs: 100, endMs: 400 }),
        ],
      }),
    ).toBe(1000);
  });

  it('only ever opens local files, and puts no typed text in the command', () => {
    const { args } = composeArgs(
      {
        clips: [
          clip('/tmp/a.mp4', { w: 720, h: 1280 }),
          clip('/tmp/b.png', { w: 10, h: 10, photo: true }),
        ],
        music: { path: '/tmp/m.m4a', startMs: 0, endMs: 900, volume: 1 },
      },
      '/tmp/o.mp4',
    );
    const whitelists = args.flatMap((a, i) => (a === '-protocol_whitelist' ? [args[i + 1]] : []));
    expect(whitelists).toEqual(['file', 'file', 'file']);
    expect(args).toContain('-map_metadata');
    // Every `-i` is preceded by its own whitelist and forced demuxer.
    args.forEach((a, i) => {
      if (a === '-i') expect(args[i - 2]).toBe('-f');
    });
  });
});
