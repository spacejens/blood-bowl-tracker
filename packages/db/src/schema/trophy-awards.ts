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
 * link row, dedup'd on its own natural key instead. `competition_teams` is the
 * exact precedent: it too has no external-ids table and carries a unique
 * constraint on its own natural key.
 *
 * That natural key is `(trophy_id, competition_id, team_era_id, player_id)`,
 * enforced by `trophy_awards_trophy_competition_team_era_player_unique`. It
 * covers both recipient kinds without a partial or conditional index:
 *
 *  - A team trophy always has `player_id = NULL` and has exactly one winner
 *    per competition, so `(trophy, competition, team era)` alone identifies
 *    it. This works only because the constraint is NULLS NOT DISTINCT —
 *    Postgres's NULLS DISTINCT default treats two NULL `player_id`s as
 *    different and would let the same team award be recorded twice.
 *  - A player trophy names its winner, so a tie (e.g. "Top Intercepter",
 *    which real BBL data has tied up to four ways) simply produces several
 *    rows differing only in `player_id`. No cutoff on tie size is enforced
 *    here.
 *
 * The constraint does NOT enforce that `player_id` is set exactly when the
 * referenced trophy's `recipient_kind` is `'player'` — that remains the
 * application-level invariant described above.
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
