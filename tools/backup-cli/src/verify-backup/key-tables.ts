/**
 * `game_data` tables a functional production backup always has rows in.
 * Checked after a restore; an empty one means the data did not come back.
 */
export const KEY_TABLES = [
  'coaches',
  'teams',
  'players',
  'matches',
  'competitions',
] as const;
