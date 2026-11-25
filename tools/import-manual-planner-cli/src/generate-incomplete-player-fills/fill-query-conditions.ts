import type { SQL } from '@blood-bowl-tracker/db';
import {
  and,
  eq,
  externalSystems,
  positions,
  sql,
} from '@blood-bowl-tracker/db';
import type { ConsequenceType } from '@blood-bowl-tracker/domain-enums';
import {
  CONSEQUENCE_TYPES,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/domain-enums';
import { INCOMPLETE_PLAYER_CRITERIA } from '@blood-bowl-tracker/game-data';

import type { CharacteristicKey } from './characteristic-keys';

/** A consequence type that lowers one characteristic. */
export type StatReductionType = Extract<
  ConsequenceType,
  `stat_reduction_${string}`
>;

/** The characteristic each stat-reduction consequence lowers. */
export const STAT_REDUCTION_CHARACTERISTIC = {
  stat_reduction_ma: 'ma',
  stat_reduction_st: 'st',
  stat_reduction_ag: 'ag',
  stat_reduction_pa: 'pa',
  stat_reduction_av: 'av',
} as const satisfies Record<StatReductionType, CharacteristicKey>;

/** The stat-reduction consequence types, in CONSEQUENCE_TYPES order. */
export const STAT_REDUCTION_TYPES: StatReductionType[] =
  CONSEQUENCE_TYPES.filter(
    (type): type is StatReductionType => type in STAT_REDUCTION_CHARACTERISTIC,
  );

/**
 * game-data's INCOMPLETE_PLAYER_CRITERIA as one predicate over
 * `game_data.players`, so the generator selects exactly the players
 * `/debugincompleteimport` counts. It never yields NULL (the characteristic
 * columns are NOT NULL and the rest are `is null` tests), so `not(...)`
 * selects exactly the complete players.
 */
export const INCOMPLETE_PLAYER: SQL = sql`(${sql.join(
  [...INCOMPLETE_PLAYER_CRITERIA],
  sql` or `,
)})`;

/**
 * A non-star player named by a `tourplay.net` id: one the TP feed can
 * report. A player with a BBL id as well counts as TP. It needs `positions`
 * and `external_systems` joined to the player and his external ids.
 */
export const TP_NON_STAR_PLAYER = and(
  eq(externalSystems.name, TP_EXTERNAL_SYSTEM_NAME),
  eq(positions.isStarPlayer, false),
);
