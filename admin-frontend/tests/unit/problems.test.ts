import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/client/api';
import { inPercent, problemsFrom } from '@/lib/client/problems';

describe('inPercent', () => {
  it("rewrites the API's fractions as the percentages the form shows", () => {
    expect(inPercent('weights must add up to 1 (they add up to 1.15)')).toBe(
      'weights must add up to 100% (they add up to 115%)',
    );
    expect(inPercent('geoMix must add up to 1 (it adds up to 0.9)')).toBe(
      'geoMix must add up to 100% (they add up to 90%)',
    );
  });

  it('removes floating-point noise', () => {
    expect(inPercent('weights must add up to 1 (they add up to 0.9500000001)')).toContain('(they add up to 95%)');
  });

  it('leaves every other message alone', () => {
    expect(inPercent('each rung must need more qualified reach than the one below')).toBe(
      'each rung must need more qualified reach than the one below',
    );
  });
});

describe('problemsFrom', () => {
  it('lists every problem the API reported, with where each belongs', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', 'Check these fields.', {
      details: [
        { field: 'weights', reasons: ['weights must add up to 1 (they add up to 1.15)'] },
        { field: 'levels.state.minScore', reasons: ['must be at least the score of the rung below', 'second reason'] },
      ],
    });
    expect(problemsFrom(error, () => 'fallback')).toEqual([
      { path: 'weights', message: 'weights must add up to 100% (they add up to 115%)' },
      { path: 'levels.state.minScore', message: 'must be at least the score of the rung below' },
      { path: 'levels.state.minScore', message: 'second reason' },
    ]);
  });

  it('falls back to one general message for anything else', () => {
    expect(problemsFrom(new Error('boom'), () => 'Try again')).toEqual([{ path: '', message: 'Try again' }]);
    expect(problemsFrom(new ApiError(500, 'INTERNAL', 'x'), () => 'Try again')).toEqual([
      { path: '', message: 'Try again' },
    ]);
  });
});
