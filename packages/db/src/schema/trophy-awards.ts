import { integer, serial } from 'drizzle-orm/pg-core';

import { competitions } from './competitions';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { players } from './players';
import { teamEras } from './team-eras';
import { trophies } from './trophies';

/**
 * One trophy actually handed out, in one competition, to one recipient.
 *
 * `team_era_id` is always set, including for player-level awards: a player
 * never changes teams, so the award's team era stays consistent with the
 * player's own, and "awards by team" queries need no join through `players`.
 * `player_id` is set only when the referenced trophy's `recipient_kind` is
 * `'player'`.
 *
 * That last rule is an application-level invariant, NOT a database check
 * constraint: Postgres cannot cross-reference another table (`trophies`) in a
 * plain `check()`, and a trigger was judged not worth the complexity — the
 * same reasoning and the same precedent as `matches.match_category` vs. its
 * competition's type (see `matches.ts`). Nothing populates this table yet, so
 * the invariant has no enforcement site today; the future importer-integration
 * issue that first writes to it must validate it in the service that does.
 *
 * There is deliberately no `trophy_awards_external_ids` table — this is a pure
 * link row, matching the precedent of `competition_teams`. The importer that
 * eventually populates it will need its own natural-key upsert strategy for
 * idempotency (e.g. a composite `<awardType>-<competitionId>`, as
 * `BblPositionsImportService` composes `${typId}-${race.bblId}` because BBL's
 * raw `typId` alone isn't globally unique either).
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
});

export const trophyAwards = trophyAwardsTable.table;
export const trophyAwardsHistory = trophyAwardsTable.historyTable;

export type TrophyAward = typeof trophyAwards.$inferSelect;
export type NewTrophyAward = typeof trophyAwards.$inferInsert;
