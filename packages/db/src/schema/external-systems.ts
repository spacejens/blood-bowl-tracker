import { EXTERNAL_SYSTEM_CATEGORIES } from '@blood-bowl-tracker/domain-enums';
import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

/**
 * See `EXTERNAL_SYSTEM_CATEGORIES` in `@blood-bowl-tracker/domain-enums` for
 * what each category means.
 */
export const externalSystemCategoryEnum = gameData.enum(
  'external_system_category',
  EXTERNAL_SYSTEM_CATEGORIES,
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
