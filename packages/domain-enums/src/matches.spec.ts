import { describe, expect, it } from 'vitest';

import { MATCH_CATEGORIES } from './matches';

describe('MATCH_CATEGORIES', () => {
  it('lists every match category in schema order', () => {
    expect(MATCH_CATEGORIES).toEqual([
      'normal',
      'cup_final',
      'season_semi_final',
      'season_final',
      'season_bronze',
      'season_qualifier',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(MATCH_CATEGORIES).size).toBe(MATCH_CATEGORIES.length);
  });
});
