import { sql } from 'drizzle-orm';
import { check, integer, serial } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { matchTeams } from './match-teams';
import { matches } from './matches';
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
]);

/**
 * Top-level classification for match events that have no actor and no
 * consequence recipient (e.g. a weather roll) — parallel to `actionType`/
 * `consequenceType` and mutually exclusive with both (see
 * `actionOrConsequence` check below).
 */
export const eventTypeEnum = gameData.enum('event_type', ['weather']);

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
     * Opaque, un-decoded TP-internal weather-table code, observed to range
     * over at least `0, 10, 20, 30, 40, 50, 100-113` in the local fixture
     * corpus. Almost certainly a closed set of named weather-table results,
     * but no authoritative code-to-name mapping is available yet — see
     * follow-up issue for decoding this into a named enum.
     */
    weatherType: integer('weather_type'),
    inducementsCost: integer('inducements_cost'),
    /**
     * The portion of an inducements spend paid out of the team's treasury
     * (as opposed to free stadium/petty-cash allowance).
     */
    inducementsFromTreasury: integer('inducements_from_treasury'),
    winnings: integer('winnings'),
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
    secretObjective: integer('secret_objective'),
    /** Gold pieces lost to the roll, not the Expensive Mistakes table tier rolled. */
    expensiveMistake: integer('expensive_mistake'),
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
