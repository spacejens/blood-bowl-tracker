import { boolean, serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

const externalSystemsTable = historyTrackedTable({
  schema: gameData,
  name: 'external_systems',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    isBookkeeping: boolean('is_bookkeeping').notNull(),
  },
});

export const externalSystems = externalSystemsTable.table;
export const externalSystemsHistory = externalSystemsTable.historyTable;

export type ExternalSystem = typeof externalSystems.$inferSelect;
export type NewExternalSystem = typeof externalSystems.$inferInsert;
