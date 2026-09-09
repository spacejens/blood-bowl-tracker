import { describe, expect, it } from 'vitest';

import { COMPETITION_TYPES } from './competitions';

describe('COMPETITION_TYPES', () => {
  it('lists every competition type in schema order', () => {
    expect(COMPETITION_TYPES).toEqual(['season', 'cup']);
  });

  it('has no duplicate values', () => {
    expect(new Set(COMPETITION_TYPES).size).toBe(COMPETITION_TYPES.length);
  });
});
