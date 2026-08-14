import { integer, serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { leagues } from './leagues';
import { gameData } from './pg-schema';

/**
 * The curated catalog of recurring competition tracks (issue #445): "Major
 * Season", "Chaos Cup", "Ogretoberfest", and so on. A competition instance and
 * a trophy each belong to exactly one group, which is what distinguishes a
 * Major season's 1st place from a Minor season's 1st place even when both
 * sources label them identically.
 *
 * Deliberately has no external-ids table and no description: a group is a pure
 * curation decision made in tools/import-manual, never inferred from a source
 * system, and nothing needs prose about one. Identity is its `name`, which
 * `CompetitionGroupsService.upsert` matches on (the same precedent
 * `ExternalSystemsService` and `TrophiesService`'s name path set).
 */
const competitionGroupsTable = historyTrackedTable({
  schema: gameData,
  name: 'competition_groups',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    leagueId: integer('league_id')
      .references(() => leagues.id)
      .notNull(),
  },
});

export const competitionGroups = competitionGroupsTable.table;
export const competitionGroupsHistory = competitionGroupsTable.historyTable;

export type CompetitionGroup = typeof competitionGroups.$inferSelect;
export type NewCompetitionGroup = typeof competitionGroups.$inferInsert;
