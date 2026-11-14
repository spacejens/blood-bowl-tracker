import { or } from '@blood-bowl-tracker/db';
import type { SQL } from '@blood-bowl-tracker/db/test-helpers';
import { PgDialect } from '@blood-bowl-tracker/db/test-helpers';
import { describe, expect, it } from 'vitest';

import { INCOMPLETE_PLAYER_CRITERIA } from './incomplete-player-criteria';

describe('INCOMPLETE_PLAYER_CRITERIA', () => {
  it('matches a zero MA/ST/AG/AV or a missing SPP total, SPP adjustment or status, never passing', () => {
    const query = new PgDialect().sqlToQuery(
      or(...INCOMPLETE_PLAYER_CRITERIA) as unknown as SQL,
    );

    expect(query.sql).toBe(
      '(("game_data"."players"."move" = $1) ' +
        'or ("game_data"."players"."strength" = $2) ' +
        'or ("game_data"."players"."agility" = $3) ' +
        'or ("game_data"."players"."armour" = $4) ' +
        'or (("game_data"."players"."spp_total" is null)) ' +
        'or (("game_data"."players"."spp_adjustment" is null)) ' +
        'or (("game_data"."players"."status" is null)))',
    );
    expect(query.params).toEqual([0, 0, 0, 0]);
  });
});
