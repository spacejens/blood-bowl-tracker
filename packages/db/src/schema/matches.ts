import { integer, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { competitions } from './competitions';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

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
  },
});

export const matches = matchesTable.table;
export const matchesHistory = matchesTable.historyTable;

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
