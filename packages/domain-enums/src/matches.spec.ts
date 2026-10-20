import { describe, expect, expectTypeOf, it } from 'vitest';

import type { MatchCategory } from './matches';
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

  it('types MatchCategory as exactly its listed values', () => {
    expectTypeOf<MatchCategory>().toEqualTypeOf<
      | 'normal'
      | 'cup_final'
      | 'season_semi_final'
      | 'season_final'
      | 'season_bronze'
      | 'season_qualifier'
    >();
  });
});
