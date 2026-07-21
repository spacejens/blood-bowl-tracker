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
  'weather_roll',
  'inducements_roll',
  'winnings_roll',
  'fan_factor_roll',
  'journeyman_signing',
  'prayers_to_nuffle',
  'dedicated_fans_roll',
  'secret_objective',
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
    weatherType: integer('weather_type'),
    inducementsCost: integer('inducements_cost'),
    winnings: integer('winnings'),
    fanFactor: integer('fan_factor'),
    journeymenCount: integer('journeymen_count'),
    prayersToNuffle: integer('prayers_to_nuffle'),
    dedicatedFans: integer('dedicated_fans'),
    secretObjective: integer('secret_objective'),
    expensiveMistake: integer('expensive_mistake'),
  },
  extraConfig: (t) => ({
    actionOrConsequence: check(
      'match_events_action_or_consequence',
      sql`${t.actionType} IS NOT NULL OR ${t.consequenceType} IS NOT NULL`,
    ),
  }),
});

export const matchEvents = matchEventsTable.table;
export const matchEventsHistory = matchEventsTable.historyTable;

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
