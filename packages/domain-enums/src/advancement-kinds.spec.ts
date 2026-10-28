import { describe, expect, expectTypeOf, it } from 'vitest';

import type { AdvancementKind } from './advancement-kinds';
import { ADVANCEMENT_KINDS } from './advancement-kinds';

describe('ADVANCEMENT_KINDS', () => {
  it('lists every advancement kind in schema order', () => {
    expect(ADVANCEMENT_KINDS).toEqual([
      'table_roll',
      'random_primary_skill',
      'chosen_primary_skill',
      'random_secondary_skill',
      'chosen_secondary_skill',
      'random_characteristic',
      'granted_skill',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(ADVANCEMENT_KINDS).size).toBe(ADVANCEMENT_KINDS.length);
  });

  it('types AdvancementKind as exactly its listed values', () => {
    expectTypeOf<AdvancementKind>().toEqualTypeOf<
      | 'table_roll'
      | 'random_primary_skill'
      | 'chosen_primary_skill'
      | 'random_secondary_skill'
      | 'chosen_secondary_skill'
      | 'random_characteristic'
      | 'granted_skill'
    >();
  });
});
