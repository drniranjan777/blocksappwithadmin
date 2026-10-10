import { describe, expect, it } from 'vitest';
import {
  REACH_GROUPS,
  fieldFor,
  getPath,
  parseFormValue,
  setPath,
  showConfigValue,
  toFormValue,
} from '@/lib/reach-fields';

const config = {
  weights: { qualifiedViewers: 0.25, shares: 0.07 },
  fraud: { excludeAtOrAbove: 70 },
  qualification: { requireVerifiedViewer: true },
  levels: { state: { minScore: 55.5 } },
};

describe('the field map', () => {
  it('has no field twice', () => {
    const paths = REACH_GROUPS.flatMap((g) => g.fields.map((f) => f.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('covers the seven score weights and the three geographic shares, which must each total 100%', () => {
    const totals = REACH_GROUPS.filter((g) => g.mustTotal100);
    expect(totals.map((g) => g.fields.length)).toEqual([7, 3]);
    expect(totals.every((g) => g.fields.every((f) => f.kind === 'percent'))).toBe(true);
  });

  it('finds a field by its place in the document', () => {
    expect(fieldFor('levels.state.minScore')?.label).toContain('S1 State');
    expect(fieldFor('nothing.here')).toBeUndefined();
  });
});

describe('reading a value into the form', () => {
  it('shows fractions as percentages, without floating-point noise', () => {
    expect(toFormValue({ path: 'weights.shares', label: '', kind: 'percent' }, config)).toBe('7');
    expect(toFormValue({ path: 'weights.qualifiedViewers', label: '', kind: 'percent' }, config)).toBe('25');
  });

  it('shows other numbers and flags as they are', () => {
    expect(toFormValue({ path: 'levels.state.minScore', label: '', kind: 'number' }, config)).toBe('55.5');
    expect(toFormValue({ path: 'qualification.requireVerifiedViewer', label: '', kind: 'bool' }, config)).toBe(true);
  });

  it('leaves a missing value empty', () => {
    expect(toFormValue({ path: 'fraud.missing', label: '', kind: 'int' }, config)).toBe('');
  });
});

describe('turning what was typed back into a value', () => {
  it('turns percentages into fractions', () => {
    expect(parseFormValue({ path: 'x', label: '', kind: 'percent' }, '7')).toEqual({ ok: true, value: 0.07 });
    expect(parseFormValue({ path: 'x', label: '', kind: 'percent' }, ' 33.3333 ')).toEqual({
      ok: true,
      value: 0.333333,
    });
  });

  it('refuses blanks, words, negatives, and decimals where a whole number is needed', () => {
    const int = { path: 'x', label: '', kind: 'int' as const };
    expect(parseFormValue(int, '')).toMatchObject({ ok: false });
    expect(parseFormValue(int, 'ten')).toMatchObject({ ok: false });
    expect(parseFormValue(int, '-1')).toMatchObject({ ok: false });
    expect(parseFormValue(int, '2.5')).toMatchObject({ ok: false, message: 'Use a whole number.' });
    expect(parseFormValue(int, '70')).toEqual({ ok: true, value: 70 });
  });

  it('round-trips every kind of value unchanged', () => {
    for (const [kind, stored] of [
      ['percent', 0.07],
      ['number', 55.5],
      ['int', 70],
    ] as const) {
      const def = { path: 'p', label: '', kind };
      const parsed = parseFormValue(def, String(toFormValue(def, { p: stored })));
      expect(parsed).toEqual({ ok: true, value: stored });
    }
  });
});

describe('document paths', () => {
  it('reads nested values and tolerates gaps', () => {
    expect(getPath(config, 'levels.state.minScore')).toBe(55.5);
    expect(getPath(config, 'levels.global.minScore')).toBeUndefined();
    expect(getPath(null, 'a.b')).toBeUndefined();
  });

  it('sets a value on a copy and leaves the original alone', () => {
    const next = setPath(config, 'weights.shares', 0.2);
    expect(next.weights.shares).toBe(0.2);
    expect(config.weights.shares).toBe(0.07);
    expect(next.weights.qualifiedViewers).toBe(0.25);
  });

  it('creates the levels in between when they are missing', () => {
    expect(setPath({}, 'a.b.c', 1)).toEqual({ a: { b: { c: 1 } } });
  });
});

describe('showConfigValue', () => {
  it('writes values the way a person reads them', () => {
    expect(showConfigValue(0.25, 'percent')).toBe('25%');
    expect(showConfigValue(true)).toBe('Yes');
    expect(showConfigValue(false)).toBe('No');
    expect(showConfigValue(70)).toBe('70');
    expect(showConfigValue(undefined)).toBe('—');
  });
});
