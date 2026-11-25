/** A `game_data.players` column a gap is tested on, by its SQL name. */
export type IncompletePlayerColumn =
  | 'move'
  | 'strength'
  | 'agility'
  | 'armour'
  | 'spp_total'
  | 'spp_adjustment'
  | 'status';

/** One kind of gap: the column equals 0, or the column is null. */
export interface IncompletePlayerGap {
  column: IncompletePlayerColumn;
  test: 'eq0' | 'isNull';
}

/**
 * What makes a player's imported data incomplete; a player matching ANY entry
 * counts. A zero `move`/`strength`/`agility`/`armour` is the column default,
 * legal under no rules set, so it marks an import that never supplied the
 * real value. A NULL `spp_total`/`spp_adjustment`/`status` means no source
 * populated it. `passing` is deliberately absent: NULL and 0 are both
 * legitimate there. A new kind of gap is a one-line addition to this list.
 *
 * Star players are never counted, whatever these columns hold. That exclusion
 * is applied by each reader, not in this list, because it narrows which
 * players are looked at rather than describing a kind of gap.
 *
 * One definition for every reader: game-data renders it as SQL for the
 * `/debugincompleteimport` query and for the manual fill of a missing player
 * (PlayerFillStateService), and the manual-import planner's SQL uses it too,
 * so a player the fill accepts as incomplete is exactly one the bot counts.
 */
export const INCOMPLETE_PLAYER_GAPS: readonly IncompletePlayerGap[] = [
  { column: 'move', test: 'eq0' },
  { column: 'strength', test: 'eq0' },
  { column: 'agility', test: 'eq0' },
  { column: 'armour', test: 'eq0' },
  { column: 'spp_total', test: 'isNull' },
  { column: 'spp_adjustment', test: 'isNull' },
  { column: 'status', test: 'isNull' },
];
