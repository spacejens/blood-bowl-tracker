import { describe, expect, expectTypeOf, it } from 'vitest';

import type { PlayerStatus } from './player-statuses';
import { PLAYER_STATUSES } from './player-statuses';

describe('PLAYER_STATUSES', () => {
  it('lists every player status in schema order', () => {
    expect(PLAYER_STATUSES).toEqual([
      'active',
      'dead',
      'retired',
      'temporarily_retired',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(PLAYER_STATUSES).size).toBe(PLAYER_STATUSES.length);
  });

  it('types PlayerStatus as exactly its listed values', () => {
    expectTypeOf<PlayerStatus>().toEqualTypeOf<
      'active' | 'dead' | 'retired' | 'temporarily_retired'
    >();
  });
});
