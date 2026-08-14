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
 * link row. `competition_teams` is NOT an exact precedent for that, though:
 * it too has no external-ids table, but it DOES carry a unique constraint on
 * its own natural key (`competition_id`, `team_era_id`) that this table
 * currently lacks entirely.
 *
 * `trophy_awards` has no unique/natural-key constraint of any kind today.
 * That is a deliberate, open gap, not an oversight: the correct natural key
 * differs by the referenced trophy's `recipient_kind`. Team trophies have
 * exactly one winner per competition, but at least one curated player trophy
 * does not — "Top Intercepter" (see
 * `tools/import-manual/data/before-other-importers/trophies.json5`) is "not
 * awarded if tied between more than three players", implying ties up to
 * three ARE otherwise allowed and can produce multiple award rows for the
 * same trophy and competition. Settling the real natural key needs the
 * actual import logic this issue does not build, so it is left to the future
 * importer-integration issue (parent issue #341's later work) rather than
 * guessed at here — there is also no existing precedent anywhere in
 * `packages/db/src/schema/*.ts` for a partial/conditional unique index, which
 * a `recipientKind`-dependent constraint would likely require.
 *
 * Separately, whatever importer eventually populates this table will still
 * need a composite identifier scheme to match TP's `awardType` codes to the
 * right trophy — that is a `trophies_external_ids` concern (issues #445,
 * #446), independent of and not a substitute for this table's own missing
 * natural-key constraint.
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
