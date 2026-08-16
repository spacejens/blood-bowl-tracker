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
 * Deliberately has no description: a group is a pure curation decision made in
 * tools/import-manual, and nothing needs prose about one.
 *
 * It does carry external ids (competition_groups_external_ids), like every
 * other entity here. Although no source system names a group, tools/import-manual
 * runs its two data directories as two separate processes with independent
 * in-memory ExternalIdMaps, and every run starts from an empty one, so a
 * re-run has to re-resolve groups onto their existing rows. That is exactly what the
 * synthetic "Name" external system exists for: the group's name becomes a
 * stable, deterministic external id (NameExternalIdService.forCompetitionGroup),
 * and `CompetitionGroupsService.upsert` matches on external ids like every
 * other upsert, instead of on `name`.
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
