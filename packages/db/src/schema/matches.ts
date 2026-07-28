import {
  type AnyPgColumn,
  integer,
  serial,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import { competitions } from './competitions';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { teamEras } from './team-eras';

/**
 * What kind of match this is within its competition. `normal` covers the
 * bulk of both cup and season play (many cups are just a run of normal
 * matches with no special final); the other values name the specific
 * knock-out stages.
 *
 * There is deliberately no `unknown` catch-all: an importer that cannot
 * recognize a match's stage must fail loudly rather than silently default.
 *
 * Consistency with the owning competition's `type` (e.g. `cup_final` only on
 * a cup, `season_*` only on a season) is NOT enforced in the database —
 * Postgres cannot cross-reference another table in a plain `check()`, and a
 * trigger was judged not worth the complexity. It is validated in
 * `MatchesService.upsert` (packages/game-data) instead.
 */
export const matchCategoryEnum = gameData.enum('match_category', [
  'normal',
  'cup_final',
  'season_semi_final',
  'season_final',
  'season_bronze',
  'season_qualifier',
]);

/**
 * `matches` and `match_teams` are defined in one module because their foreign
 * keys point at each other: `match_teams.match_id -> matches.id` and
 * `matches.winning_match_team_id -> match_teams.id`. Splitting them across
 * two modules would require a circular import between them; the repo has no
 * other module cycle (`pnpm hygiene:cycles`), so they are colocated instead.
 *
 * `match_teams.match_id` references `matches.id` via a lazily-evaluated
 * callback (`(): AnyPgColumn => matches.id`) rather than the usual
 * `() => matches.id` inline arrow, because `matches` is declared later in
 * this module — the lazy callback is only invoked after both `const`s have
 * been assigned, so the forward reference resolves correctly and
 * drizzle-kit still emits the `match_teams_match_id_matches_id_fk`
 * constraint.
 */
const matchTeamsTable = historyTrackedTable({
  schema: gameData,
  name: 'match_teams',
  columns: {
    id: serial('id').primaryKey(),
    matchId: integer('match_id')
      .references((): AnyPgColumn => matches.id)
      .notNull(),
    teamEraId: integer('team_era_id')
      .references(() => teamEras.id)
      .notNull(),
    /**
     * This team's final touchdown count for the match — a deliberate
     * denormalization of the `touchdown` match events attributed to this row,
     * computed once at import time (see MatchOutcomesService in
     * packages/game-data). Defaults to 0 so the column can be NOT NULL for
     * rows that predate the outcome step or that scored nothing.
     */
    score: integer('score').notNull().default(0),
  },
  extraConfig: (t) => ({
    uniqueMatchTeam: unique('match_teams_match_id_team_era_id_unique').on(
      t.matchId,
      t.teamEraId,
    ),
  }),
});

export const matchTeams = matchTeamsTable.table;
export const matchTeamsHistory = matchTeamsTable.historyTable;

export type MatchTeam = typeof matchTeams.$inferSelect;
export type NewMatchTeam = typeof matchTeams.$inferInsert;

const matchesTable = historyTrackedTable({
  schema: gameData,
  name: 'matches',
  columns: {
    id: serial('id').primaryKey(),
    competitionId: integer('competition_id')
      .references(() => competitions.id)
      .notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    category: matchCategoryEnum('category').notNull(),
    /**
     * The `match_teams` row that won. NULL always and only means a draw:
     * every match's outcome is fully resolved at import time, so there is no
     * third "not computed" state. Works uniformly for the normal two-team
     * match and for the four-team merged Ogretoberfest finals.
     */
    winningMatchTeamId: integer('winning_match_team_id').references(
      () => matchTeams.id,
    ),
  },
});

export const matches = matchesTable.table;
export const matchesHistory = matchesTable.historyTable;

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
