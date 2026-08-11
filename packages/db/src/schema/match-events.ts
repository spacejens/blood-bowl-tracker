import { sql } from 'drizzle-orm';
import { check, integer, serial } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { matches, matchTeams } from './matches';
import { gameData } from './pg-schema';
import { players } from './players';

export const actionTypeEnum = gameData.enum('action_type', [
  'touchdown',
  'completion',
  'interception',
  'deflection',
  'foul',
  'mvp_award',
  'casualty',
  'badly_hurt',
  'serious_injury',
  'death',
  'inducements',
  'winnings',
  'fan_factor',
  'journeymen_signings',
  'prayers_to_nuffle',
  'secret_objective',
  'successful_landing',
]);

export const consequenceTypeEnum = gameData.enum('consequence_type', [
  'casualty',
  'badly_hurt',
  'serious_injury',
  'miss_next_game',
  'niggling_injury',
  'stat_reduction_ma',
  'stat_reduction_st',
  'stat_reduction_ag',
  'stat_reduction_av',
  'stat_reduction_pa',
  'death',
  'sent_off',
  'expensive_mistake',
  'concession',
  'dedicated_fans',
  // A casualty the source reports as prevented. The prevented severity lives
  // in `consequence_avoided_severity`, so this value is deliberately absent
  // from every *_SUFFERED_TYPES list in packages/game-data.
  'casualty_avoided',
]);

/**
 * What a source says an un-indexed participant was, when it names the
 * participant as plain text instead of linking a player row. A journeyman or
 * mercenary IS a real player the source merely does not index; only
 * `fans_or_random_event` is genuinely not a player — hence "unidentified"
 * rather than "non-player". The `*_or_*` values preserve the source's own
 * ambiguity instead of inventing a resolution.
 */
export const unidentifiedParticipantKindEnum = gameData.enum(
  'unidentified_participant_kind',
  [
    'journeyman',
    'mercenary',
    'mercenary_or_star',
    'fans_or_random_event',
    'mercenary_or_fans_or_random_event',
  ],
);

/** How a casualty the source reports was prevented from taking effect. */
export const consequenceAvoidedByEnum = gameData.enum(
  'consequence_avoided_by',
  ['apothecary', 'regeneration'],
);

/**
 * Top-level classification for match events that have no actor and no
 * consequence recipient (e.g. a weather roll) — parallel to `actionType`/
 * `consequenceType` and mutually exclusive with both (see
 * `actionOrConsequence` check below).
 */
export const eventTypeEnum = gameData.enum('event_type', ['weather']);

/**
 * The named weather condition a `weather`-classified event decodes to, from
 * an importer's raw source-specific weather code (decoded before import
 * reaches this schema). `'unknown'` is a permanent catch-all for codes not
 * yet mapped. Only set on `weather` events, the same way
 * `actionType`/`consequenceType` are only set on their own kinds.
 */
export const weatherTypeEnum = gameData.enum('weather_type', [
  'dungeon',
  'sweltering_heat',
  'very_sunny',
  'nice',
  'pouring_rain',
  'blizzard',
  'morning_dew',
  'blossoming_flowers',
  'misty_morning',
  'high_winds',
  'perfect_conditions',
  'melting_astrogranite',
  'blinding_rays',
  'monsoon',
  'leaf_strewn_pitch',
  'autumnal_chill',
  'strong_winds',
  'cold_winds',
  'freezing',
  'heavy_snow',
  'unknown',
]);

/**
 * The named secret-objective card a `secret_objective`-classified event
 * decodes to, from TP's raw opaque integer code (decoded before import
 * reaches this schema). `'unknown'` is a permanent catch-all for codes not
 * yet mapped. Only set on `secret_objective` events.
 */
export const secretObjectiveEnum = gameData.enum('secret_objective', [
  'red_card',
  'didnt_need_them_anyway',
  'going_alone',
  'fouling_frenzy',
  'going_surfing',
  'ganging_up',
  'whoops',
  'not_so_fast',
  'timely_tackle',
  'precision_passing',
  'hit_em_hard',
  'just_a_little_further',
  'go_long',
  'nuffle_favors_the_bold',
  'all_according_to_plan',
  'headtaker',
  'unknown',
]);

const matchEventsTable = historyTrackedTable({
  schema: gameData,
  name: 'match_events',
  columns: {
    id: serial('id').primaryKey(),
    matchId: integer('match_id')
      .references(() => matches.id)
      .notNull(),
    actingMatchTeamId: integer('acting_match_team_id').references(
      () => matchTeams.id,
    ),
    consequenceMatchTeamId: integer('consequence_match_team_id').references(
      () => matchTeams.id,
    ),
    actingPlayerId: integer('acting_player_id').references(() => players.id),
    consequencePlayerId: integer('consequence_player_id').references(
      () => players.id,
    ),
    actionType: actionTypeEnum('action_type'),
    consequenceType: consequenceTypeEnum('consequence_type'),
    eventType: eventTypeEnum('event_type'),
    /**
     * Set when the acting participant was not an indexed player (so
     * `acting_player_id` is null): what the source says it was.
     */
    actingUnidentifiedKind: unidentifiedParticipantKindEnum(
      'acting_unidentified_kind',
    ),
    /** Same, for the consequence recipient. */
    consequenceUnidentifiedKind: unidentifiedParticipantKindEnum(
      'consequence_unidentified_kind',
    ),
    /** Only set together with `consequence_type = 'casualty_avoided'`. */
    consequenceAvoidedBy: consequenceAvoidedByEnum('consequence_avoided_by'),
    /**
     * Which casualty severity was prevented. Reuses `consequence_type`
     * because every severity it needs is already a value there.
     */
    consequenceAvoidedSeverity: consequenceTypeEnum(
      'consequence_avoided_severity',
    ),
    /**
     * The decoded, named weather condition for a `weather`-classified event
     * (nullable because it is only set on those events). Decoded upstream,
     * before import reaches this schema; see `weatherTypeEnum`.
     */
    weatherType: weatherTypeEnum('weather_type'),
    inducementsCost: integer('inducements_cost'),
    /**
     * The portion of an inducements spend paid out of the team's treasury
     * (as opposed to free stadium/petty-cash allowance).
     */
    inducementsFromTreasury: integer('inducements_from_treasury'),
    winnings: integer('winnings'),
    /**
     * The per-side fan factor for the match, not a delta from a prior
     * value.
     */
    fanFactor: integer('fan_factor'),
    journeymenCount: integer('journeymen_count'),
    prayersToNuffle: integer('prayers_to_nuffle'),
    dedicatedFans: integer('dedicated_fans'),
    /**
     * TP's own opaque identifier code for which specific secret-objective
     * card was drawn — not a count of objectives completed. The same
     * roster can have multiple `secret_objective` events in one match with
     * different, non-sequential values, and the same value can recur across
     * different matches for different rosters.
     */
    secretObjective: secretObjectiveEnum('secret_objective'),
    /** Gold pieces lost to the roll, not the Expensive Mistakes table tier rolled. */
    expensiveMistake: integer('expensive_mistake'),
    /**
     * Star Player Points this event awarded its acting player. Populated at
     * import time for every SPP-earning action type (touchdown, completion,
     * interception, deflection, mvp_award and every casualty-caused
     * severity); NULL for `foul` and for every non-actor event kind (weather,
     * inducements, winnings, ...). TP-sourced events carry TP's own reported
     * figure verbatim; BBL-sourced events are resolved from
     * `spp_award_values`. A player's SPP total is a plain SUM over this
     * column — see packages/game-data SppTotalsService.
     */
    sppValue: integer('spp_value'),
  },
  extraConfig: (t) => ({
    actionOrConsequence: check(
      'match_events_action_or_consequence',
      sql`(${t.eventType} IS NOT NULL AND ${t.actionType} IS NULL AND ${t.consequenceType} IS NULL)
          OR (${t.eventType} IS NULL AND (${t.actionType} IS NOT NULL OR ${t.consequenceType} IS NOT NULL))`,
    ),
  }),
});

export const matchEvents = matchEventsTable.table;
export const matchEventsHistory = matchEventsTable.historyTable;

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
