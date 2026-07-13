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
  'death',
  'sent_off',
]);

const matchEventsTable = historyTrackedTable(
  gameData,
  'match_events',
  {
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
  },
  (t) => ({
    actionOrConsequence: check(
      'match_events_action_or_consequence',
      sql`${t.actionType} IS NOT NULL OR ${t.consequenceType} IS NOT NULL`,
    ),
  }),
);

export const matchEvents = matchEventsTable.table;
export const matchEventsHistory = matchEventsTable.historyTable;

export type MatchEvent = typeof matchEvents.$inferSelect;
export type NewMatchEvent = typeof matchEvents.$inferInsert;
