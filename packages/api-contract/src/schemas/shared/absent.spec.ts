import { describe, expect, it } from 'vitest';

import { absent } from './absent';

describe('absent', () => {
  it('is true for undefined', () => {
    expect(absent(undefined)).toBe(true);
  });

  it('is true for null', () => {
    expect(absent(null)).toBe(true);
  });

  it('is false for a real value', () => {
    expect(absent('touchdown')).toBe(false);
    expect(absent(0)).toBe(false);
    expect(absent(false)).toBe(false);
  });
});
