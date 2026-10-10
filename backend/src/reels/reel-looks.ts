/**
 * The colour "looks" a creator applies in the reel editor, as the server renders them.
 *
 * The app describes a look with numbers, not pixels: a named filter (a handful of
 * parameters), how strongly it is applied, and manual adjustments. The app previews it
 * with a 4x5 colour matrix; this file is the same arithmetic in TypeScript so the
 * server can produce the matrix itself from the numbers. **The server never accepts a
 * matrix from a client** (a hostile one could ask for anything); it accepts a filter id
 * from the catalogue below and numbers inside fixed ranges, and works out the rest.
 *
 * Matrix layout: four rows (R, G, B, A), each `[r, g, b, a, offset]` with offsets on a
 * 0..255 scale, exactly as in the app.
 */

export type Matrix = readonly number[];

export const IDENTITY: Matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Applies `first`, then `second`. */
export function compose(first: Matrix, second: Matrix): number[] {
  const out = Array.from({ length: 20 }, () => 0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++)
        sum += (second[row * 5 + k] as number) * (first[k * 5 + col] as number);
      if (col === 4) sum += second[row * 5 + 4] as number;
      out[row * 5 + col] = sum;
    }
  }
  return out;
}

export function chain(steps: readonly Matrix[]): Matrix {
  return steps.reduce<Matrix>((m, s) => compose(m, s), IDENTITY);
}

/** Blends `a` to `b`; `t` 0 is `a`, 1 is `b`. */
export function lerp(a: Matrix, b: Matrix, t: number): number[] {
  return a.map((x, i) => x + ((b[i] as number) - x) * t);
}

export function isIdentity(m: Matrix): boolean {
  return m.every((v, i) => Math.abs(v - (IDENTITY[i] as number)) < 1e-9);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// prettier-ignore
const m = (r: number[], g: number[], b: number[]): Matrix => [...r, ...g, ...b, 0, 0, 0, 1, 0];

/** `v` -1..1. */
export const brightness = (v: number): Matrix => {
  const o = v * 255 * 0.5;
  return m([1, 0, 0, 0, o], [0, 1, 0, 0, o], [0, 0, 1, 0, o]);
};

/** `v` -1..1 (0 unchanged); pivots around mid-grey. */
export const contrast = (v: number): Matrix => {
  const c = 1 + v;
  const o = 128 * (1 - c);
  return m([c, 0, 0, 0, o], [0, c, 0, 0, o], [0, 0, c, 0, o]);
};

/** `v` -1..1: -1 is greyscale, 0 unchanged, 1 doubled. */
export const saturation = (v: number): Matrix => {
  const s = clamp(1 + v, 0, 2);
  const [lr, lg, lb] = [0.2126, 0.7152, 0.0722];
  const inv = 1 - s;
  return m(
    [lr * inv + s, lg * inv, lb * inv, 0, 0],
    [lr * inv, lg * inv + s, lb * inv, 0, 0],
    [lr * inv, lg * inv, lb * inv + s, 0, 0],
  );
};

/** `v` -1..1: positive is warmer (more red, less blue). */
export const temperature = (v: number): Matrix =>
  m([1 + 0.18 * v, 0, 0, 0, 0], [0, 1 + 0.04 * v, 0, 0, 0], [0, 0, 1 - 0.18 * v, 0, 0]);

/** `v` -1..1: lifts (+) or deepens (-) the dark tones. */
export const shadows = (v: number): Matrix => {
  const o = 28 * v;
  const s = 1 - 0.08 * Math.abs(v);
  return m([s, 0, 0, 0, o], [0, s, 0, 0, o], [0, 0, s, 0, o]);
};

/** `v` -1..1: recovers (-) or boosts (+) the bright tones. */
export const highlights = (v: number): Matrix => {
  const g = 1 + 0.14 * v;
  const o = -12 * v;
  return m([g, 0, 0, 0, o], [0, g, 0, 0, o], [0, 0, g, 0, o]);
};

/** `f` 0..1: matte look (blacks lifted, contrast softened). */
export const fade = (f: number): Matrix => {
  const s = 1 - 0.28 * f;
  const o = 255 * 0.28 * f * 0.55;
  return m([s, 0, 0, 0, o], [0, s, 0, 0, o], [0, 0, s, 0, o]);
};

// ----------------------------------------------------------------- catalogue --

export interface FilterParams {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  fade?: number;
}

/** The BLOCKS filter set. The ids are the app's; the numbers are the same as the app's. */
export const FILTERS: Readonly<Record<string, FilterParams>> = {
  original: {},
  vivid: { contrast: 0.15, saturation: 0.45, brightness: 0.03 },
  warm: { temperature: 0.5, saturation: 0.1 },
  cool: { temperature: -0.5, saturation: 0.05 },
  cinematic: {
    contrast: 0.25,
    saturation: -0.15,
    temperature: -0.15,
    fade: 0.15,
    brightness: -0.05,
  },
  portrait: { brightness: 0.06, contrast: -0.08, saturation: -0.05, temperature: 0.15 },
  vintage: { saturation: -0.3, temperature: 0.35, fade: 0.35, contrast: -0.1 },
  bw: { saturation: -1, contrast: 0.15 },
  golden: { temperature: 0.7, brightness: 0.05, saturation: 0.2 },
  india: { saturation: 0.5, contrast: 0.2, temperature: 0.25 },
  urban: { contrast: 0.3, saturation: -0.2, temperature: -0.2 },
  food: { saturation: 0.35, temperature: 0.3, brightness: 0.05, contrast: 0.1 },
  travel: { saturation: 0.3, contrast: 0.12, temperature: -0.1, brightness: 0.03 },
  night: { brightness: -0.18, contrast: 0.22, temperature: -0.3, saturation: 0.1 },
};

export const FILTER_IDS = Object.keys(FILTERS);

/** Transitions the editor offers. Only `none` and `fade` are rendered exactly; see `renderedTransition`. */
export const TRANSITION_IDS = ['none', 'fade', 'slide', 'zoom', 'wipe'] as const;
export type TransitionId = (typeof TRANSITION_IDS)[number];

/**
 * What the server actually renders for a requested transition. Dissolve-style effects that
 * move the picture (slide, zoom, wipe) need ffmpeg's `xfade` filter, which the older builds
 * in some environments lack; until a build with it is the baseline they are rendered as the
 * fade, and the request is kept in the reel's edit data so a later render can honour it.
 */
export function renderedTransition(id: string | null | undefined): 'none' | 'fade' {
  return !id || id === 'none' ? 'none' : 'fade';
}

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  highlights: number;
  shadows: number;
  sharpness: number;
  fade: number;
  vignette: number;
}

export const NEUTRAL: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  highlights: 0,
  shadows: 0,
  sharpness: 0,
  fade: 0,
  vignette: 0,
};

/** Allowed range of each adjustment. Anything outside is refused, not clamped, so a bug shows up. */
export const ADJUSTMENT_RANGES: Readonly<Record<keyof Adjustments, readonly [number, number]>> = {
  brightness: [-1, 1],
  contrast: [-1, 1],
  saturation: [-1, 1],
  temperature: [-1, 1],
  highlights: [-1, 1],
  shadows: [-1, 1],
  sharpness: [0, 1],
  fade: [0, 1],
  vignette: [0, 1],
};

function filterMatrix(p: FilterParams): Matrix {
  return chain([
    ...(p.saturation ? [saturation(p.saturation)] : []),
    ...(p.temperature ? [temperature(p.temperature)] : []),
    ...(p.contrast ? [contrast(p.contrast)] : []),
    ...(p.brightness ? [brightness(p.brightness)] : []),
    ...(p.fade ? [fade(p.fade)] : []),
  ]);
}

function adjustmentMatrix(a: Adjustments): Matrix {
  return chain([
    ...(a.saturation ? [saturation(a.saturation)] : []),
    ...(a.temperature ? [temperature(a.temperature)] : []),
    ...(a.shadows ? [shadows(a.shadows)] : []),
    ...(a.highlights ? [highlights(a.highlights)] : []),
    ...(a.contrast ? [contrast(a.contrast)] : []),
    ...(a.brightness ? [brightness(a.brightness)] : []),
    ...(a.fade ? [fade(a.fade)] : []),
  ]);
}

/**
 * The matrix for a clip: its filter at its strength, then the manual adjustments.
 * `null` means "no visible effect", so no colour step is needed at all.
 */
export function lookMatrix(
  filterId: string | null | undefined,
  intensity: number,
  adjustments: Adjustments,
): Matrix | null {
  let out: Matrix = IDENTITY;
  const filter = filterId ? FILTERS[filterId] : undefined;
  if (filter && filterId !== 'original') {
    out = lerp(IDENTITY, filterMatrix(filter), clamp(intensity, 0, 1));
  }
  const adjusted = Object.entries(adjustments).some(
    ([k, v]) => v !== NEUTRAL[k as keyof Adjustments],
  );
  if (adjusted) out = compose(out, adjustmentMatrix(adjustments));
  return isIdentity(out) ? null : out;
}

// -------------------------------------------------------------------- ffmpeg --

const num = (v: number) => (Math.round(v * 10_000) / 10_000).toString();

/**
 * The ffmpeg filter chain that applies a matrix: mix the channels (`colorchannelmixer`
 * takes the 3x3 part), then add the per-channel offsets (`lutrgb`). The picture is moved
 * to planar RGB for the step and back to `yuv420p` after, so the result does not depend
 * on what format the input happened to be in.
 */
export function colorMatrixFilter(matrix: Matrix): string {
  const at = (i: number) => num(clamp(matrix[i] as number, -2, 2));
  const mix = [
    `rr=${at(0)}`,
    `rg=${at(1)}`,
    `rb=${at(2)}`,
    `gr=${at(5)}`,
    `gg=${at(6)}`,
    `gb=${at(7)}`,
    `br=${at(10)}`,
    `bg=${at(11)}`,
    `bb=${at(12)}`,
  ].join(':');
  const offset = (i: number) => Math.round(clamp(matrix[i] as number, -255, 255));
  const lut = (name: string, i: number) => `${name}='clip(val+(${offset(i)}),0,maxval)'`;
  return `format=gbrp,colorchannelmixer=${mix},lutrgb=${lut('r', 4)}:${lut('g', 9)}:${lut('b', 14)},format=yuv420p`;
}
