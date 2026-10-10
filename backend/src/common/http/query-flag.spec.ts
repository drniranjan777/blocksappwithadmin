import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { QueryFlag } from './query-flag.js';

class Query {
  @QueryFlag()
  flag?: boolean;
}

const read = (value: unknown) => {
  const q = plainToInstance(Query, value === undefined ? {} : { flag: value });
  return { value: q.flag, errors: validateSync(q).length };
};

describe('a true/false query parameter', () => {
  it('reads the words as they are meant', () => {
    expect(read('true')).toEqual({ value: true, errors: 0 });
    expect(read('false')).toEqual({ value: false, errors: 0 });
    // JSON bodies already carry real booleans.
    expect(read(true)).toEqual({ value: true, errors: 0 });
    expect(read(false)).toEqual({ value: false, errors: 0 });
  });

  it('may be left out', () => {
    expect(read(undefined)).toEqual({ value: undefined, errors: 0 });
  });

  it('refuses anything else instead of guessing', () => {
    for (const bad of ['yes', '1', '0', 'TRUE', '', 'null', 'maybe']) {
      expect(read(bad).errors, bad).toBe(1);
    }
  });
});
