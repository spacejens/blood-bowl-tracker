import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

/**
 * How an external system relates to our data:
 *  - `bookkeeping` — artificial, added by us for internal purposes (the
 *    synthetic "Name" fallback system). Never counted, in any view.
 *  - `imported_data_source` — a genuine external system we import structured
 *    data from (e.g. a league-tracking site an importer scrapes). The only
 *    category counted in statistics.
 *  - `referenced_not_imported` — a genuine external system we reference (an
 *    identifier is stored against an entity) but don't import structured data
 *    from (e.g. a coach's NAF number). Not counted in statistics — the
 *    identifier describes the entity it's stored against, not something tied
 *    to any particular era/competition/league.
 */
export const externalSystemCategoryEnum = gameData.enum(
  'external_system_category',
  ['bookkeeping', 'imported_data_source', 'referenced_not_imported'],
);

export type ExternalSystemCategory =
  (typeof externalSystemCategoryEnum.enumValues)[number];

const externalSystemsTable = historyTrackedTable({
  schema: gameData,
  name: 'external_systems',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    category: externalSystemCategoryEnum('category').notNull(),
  },
});

export const externalSystems = externalSystemsTable.table;
export const externalSystemsHistory = externalSystemsTable.historyTable;

export type ExternalSystem = typeof externalSystems.$inferSelect;
export type NewExternalSystem = typeof externalSystems.$inferInsert;
