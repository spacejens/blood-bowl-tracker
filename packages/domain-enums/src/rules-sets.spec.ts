import { describe, expect, it } from 'vitest';

import { CHARACTERISTIC_FORMATS } from './rules-sets';

describe('CHARACTERISTIC_FORMATS', () => {
  it('lists every characteristic format in schema order', () => {
    expect(CHARACTERISTIC_FORMATS).toEqual([
      'absent',
      'bare',
      'plus',
      'plus_zero_legal',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(CHARACTERISTIC_FORMATS).size).toBe(
      CHARACTERISTIC_FORMATS.length,
    );
  });
});
