import type { SQL } from '@blood-bowl-tracker/db';
import { eq, isNull, players } from '@blood-bowl-tracker/db';

/**
 * What makes a player's imported data incomplete; a player matching ANY entry
 * counts. A zero `move`/`strength`/`agility`/`armour` is the column default,
 * legal under no rules set, so it marks an import that never supplied the
 * real value. A NULL `spp_total`/`spp_adjustment`/`status` means no source
 * populated it. `passing` is deliberately absent: NULL and 0 are both
 * legitimate there. A new kind of gap is a one-line addition here.
 *
 * Star players are never counted, whatever these columns hold. That exclusion
 * is applied by each query, not in this list, because it narrows which
 * players are looked at rather than describing a kind of gap.
 *
 * One definition for both readers: the `/debugincompleteimport` query
 * (game-data-queries' IncompleteImportPlayersService) and the manual fill of
 * a missing player (PlayerFillStateService), so a player the fill accepts as
 * incomplete is exactly one the bot counts.
 */
export const INCOMPLETE_PLAYER_CRITERIA: readonly SQL[] = [
  eq(players.move, 0),
  eq(players.strength, 0),
  eq(players.agility, 0),
  eq(players.armour, 0),
  isNull(players.sppTotal),
  isNull(players.sppAdjustment),
  isNull(players.status),
];
