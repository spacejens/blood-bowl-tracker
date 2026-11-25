import { describe, expect, it } from 'vitest';

import { INCOMPLETE_PLAYER_GAPS } from './incomplete-player-gaps';

describe('INCOMPLETE_PLAYER_GAPS', () => {
  it('is a zero MA/ST/AG/AV or a missing SPP total, SPP adjustment or status, never passing', () => {
    expect(INCOMPLETE_PLAYER_GAPS).toEqual([
      { column: 'move', test: 'eq0' },
      { column: 'strength', test: 'eq0' },
      { column: 'agility', test: 'eq0' },
      { column: 'armour', test: 'eq0' },
      { column: 'spp_total', test: 'isNull' },
      { column: 'spp_adjustment', test: 'isNull' },
      { column: 'status', test: 'isNull' },
    ]);
  });
});
