import { date, integer, serial, varchar } from 'drizzle-orm/pg-core';

import { competitionGroups } from './competition-groups';
import { eras } from './eras';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

export const competitionTypeEnum = gameData.enum('competition_type', [
  'season',
  'cup',
]);

const competitionsTable = historyTrackedTable({
  schema: gameData,
  name: 'competitions',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    type: competitionTypeEnum('type').notNull(),
    eraId: integer('era_id')
      .references(() => eras.id)
      .notNull(),
    // Which recurring track this instance belongs to (issue #445). NOT NULL
    // with a database default because the BBL and TP importers create
    // competitions without classifying them; the default points at the
    // "Major Season" row the add_competition_groups migration seeds into a
    // brand-new table, so it is deterministically id 1. Real per-instance
    // classification is curated in
    // tools/import-manual/data/before-other-importers/competitions.json5,
    // which runs ahead of the BBL/TP importers so this column is already
    // correct by the time they run.
    competitionGroupId: integer('competition_group_id')
      .references(() => competitionGroups.id)
      .notNull()
      .default(1),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
  },
});

export const competitions = competitionsTable.table;
export const competitionsHistory = competitionsTable.historyTable;

export type Competition = typeof competitions.$inferSelect;
export type NewCompetition = typeof competitions.$inferInsert;
