import {
  ACTION_TYPES,
  CONSEQUENCE_AVOIDED_BY_VALUES,
  CONSEQUENCE_TYPES,
  EVENT_TYPES,
  SECRET_OBJECTIVES,
  UNIDENTIFIED_PARTICIPANT_KINDS,
  WEATHER_TYPES,
} from '@blood-bowl-tracker/domain-enums';
import { sql } from 'drizzle-orm';
import { check, integer, serial } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { matches, matchTeams } from './matches';
import { gameData } from './pg-schema';
import { players } from './players';

/**
 * See `ACTION_TYPES` in `@blood-bowl-tracker/domain-enums` for what each value
 * means.
 */
export const actionTypeEnum = gameData.enum('action_type', ACTION_TYPES);

/**
 * See `CONSEQUENCE_TYPES` in `@blood-bowl-tracker/domain-enums` for what each
 * value means.
 */
export const consequenceTypeEnum = gameData.enum(
  'consequence_type',
  CONSEQUENCE_TYPES,
);

/**
 * See `UNIDENTIFIED_PARTICIPANT_KINDS` in `@blood-bowl-tracker/domain-enums`
 * for what each value means.
 */
export const unidentifiedParticipantKindEnum = gameData.enum(
  'unidentified_participant_kind',
  UNIDENTIFIED_PARTICIPANT_KINDS,
);

/**
 * See `CONSEQUENCE_AVOIDED_BY_VALUES` in `@blood-bowl-tracker/domain-enums`
 * for what each value means.
 */
export const consequenceAvoidedByEnum = gameData.enum(
  'consequence_avoided_by',
  CONSEQUENCE_AVOIDED_BY_VALUES,
);

/**
 * See `EVENT_TYPES` in `@blood-bowl-tracker/domain-enums` for what each value
 * means. Mutually exclusive with `actionType`/`consequenceType` — see the
 * `actionOrConsequence` check below.
 */
export const eventTypeEnum = gameData.enum('event_type', EVENT_TYPES);

/**
 * See `WEATHER_TYPES` in `@blood-bowl-tracker/domain-enums` for what each
 * value means.
 */
export const weatherTypeEnum = gameData.enum('weather_type', WEATHER_TYPES);

/**
 * See `SECRET_OBJECTIVES` in `@blood-bowl-tracker/domain-enums` for what each
 * value means.
 */
export const secretObjectiveEnum = gameData.enum(
  'secret_objective',
  SECRET_OBJECTIVES,
);

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
     * Star Player Points this event awarded its acting player. TP-sourced
     * events carry TP's own reported figure verbatim, regardless of action
     * type -- TP is authoritative and the importer holds no duplicate copy
     * of the SPP-earning-action-type rules, so a TP-sourced `foul` or other
     * normally-non-SPP-earning kind can legitimately carry a nonzero value
     * here. BBL-sourced events are instead resolved from
     * `spp_award_values`, and only for every SPP-earning action type
     * (touchdown, completion, interception, deflection, mvp_award and every
     * casualty-caused severity); NULL for `foul` and for every non-actor
     * event kind (weather, inducements, winnings, ...) is guaranteed only on
     * that BBL-computed path. A player's SPP total is a plain SUM over this
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
