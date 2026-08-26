import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { competitions } from './competitions';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { players } from './players';
import { teamEras } from './team-eras';
import { trophies } from './trophies';

/**
 * One trophy actually handed out, in one competition, to one recipient.
 *
 * `team_era_id` is set even for a player award: a player never changes teams,
 * so it stays consistent with the player's own and "awards by team" queries
 * need no join through `players`. `player_id` is set only when the referenced
 * trophy's `recipient_kind` is `'player'` — an application-level invariant,
 * not a check constraint, because Postgres cannot cross-reference `trophies`
 * in a plain `check()` and a trigger was judged not worth the complexity (the
 * same reasoning as `matches.match_category`, see `matches.ts`).
 *
 * There is deliberately no `trophy_awards_external_ids` table: this is a pure
 * link row, dedup'd on the natural key
 * `(trophy_id, competition_id, team_era_id, player_id)` — the same treatment
 * `competition_teams` gets. That constraint is NULLS NOT DISTINCT, which is
 * what makes a team award (always `player_id = NULL`) dedup at all; Postgres's
 * default would treat two NULLs as different and allow a duplicate.
 */
const trophyAwardsTable = historyTrackedTable({
  schema: gameData,
  name: 'trophy_awards',
  columns: {
    id: serial('id').primaryKey(),
    trophyId: integer('trophy_id')
      .references(() => trophies.id)
      .notNull(),
    competitionId: integer('competition_id')
      .references(() => competitions.id)
      .notNull(),
    teamEraId: integer('team_era_id')
      .references(() => teamEras.id)
      .notNull(),
    playerId: integer('player_id').references(() => players.id),
  },
  extraConfig: (t) => ({
    uniqueTrophyAward: unique(
      'trophy_awards_trophy_competition_team_era_player_unique',
    )
      .on(t.trophyId, t.competitionId, t.teamEraId, t.playerId)
      .nullsNotDistinct(),
  }),
});

export const trophyAwards = trophyAwardsTable.table;
export const trophyAwardsHistory = trophyAwardsTable.historyTable;

export type TrophyAward = typeof trophyAwards.$inferSelect;
export type NewTrophyAward = typeof trophyAwards.$inferInsert;
