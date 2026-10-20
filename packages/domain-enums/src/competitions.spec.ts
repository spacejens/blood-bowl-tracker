import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CompetitionType } from './competitions';
import { COMPETITION_TYPES } from './competitions';

describe('COMPETITION_TYPES', () => {
  it('lists every competition type in schema order', () => {
    expect(COMPETITION_TYPES).toEqual(['season', 'cup']);
  });

  it('has no duplicate values', () => {
    expect(new Set(COMPETITION_TYPES).size).toBe(COMPETITION_TYPES.length);
  });

  it('types CompetitionType as exactly its listed values', () => {
    expectTypeOf<CompetitionType>().toEqualTypeOf<'season' | 'cup'>();
  });
});
