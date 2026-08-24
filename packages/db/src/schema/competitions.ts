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
    // Which recurring track this instance belongs to. NOT NULL with no
    // database default: an unclassified competition must fail loudly on
    // create rather than silently land in whichever group happens to be
    // id 1. Classification is curated per instance in
    // tools/import-manual/data/before-other-importers/competitions.json5,
    // which runs ahead of the BBL/TP importers so this column is already
    // correct by the time they run; a competition those importers reach
    // first, with no curated row, surfaces as a per-record import error
    // naming the missing field.
    competitionGroupId: integer('competition_group_id')
      .references(() => competitionGroups.id)
      .notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
  },
});

export const competitions = competitionsTable.table;
export const competitionsHistory = competitionsTable.historyTable;

export type Competition = typeof competitions.$inferSelect;
export type NewCompetition = typeof competitions.$inferInsert;
