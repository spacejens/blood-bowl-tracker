import type { PgColumn, SQL } from '@blood-bowl-tracker/db';
import { eq, isNull, players } from '@blood-bowl-tracker/db';
import type { IncompletePlayerColumn } from '@blood-bowl-tracker/game-rules';
import { INCOMPLETE_PLAYER_GAPS } from '@blood-bowl-tracker/game-rules';

/** Each gap column as the drizzle `players` column it names. */
const PLAYER_COLUMNS: Readonly<Record<IncompletePlayerColumn, PgColumn>> = {
  move: players.move,
  strength: players.strength,
  agility: players.agility,
  armour: players.armour,
  spp_total: players.sppTotal,
  spp_adjustment: players.sppAdjustment,
  status: players.status,
};

/**
 * game-rules' INCOMPLETE_PLAYER_GAPS as drizzle conditions over `players`;
 * a player matching ANY entry is incomplete. Star players are excluded by
 * each query, not here.
 */
export const INCOMPLETE_PLAYER_CRITERIA: readonly SQL[] =
  INCOMPLETE_PLAYER_GAPS.map(({ column, test }) =>
    test === 'eq0'
      ? eq(PLAYER_COLUMNS[column], 0)
      : isNull(PLAYER_COLUMNS[column]),
  );
