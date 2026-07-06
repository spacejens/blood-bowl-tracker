import { serial, varchar } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { historyTrackedTable } from './history';

const externalSystemsTable = historyTrackedTable(gameData, 'external_systems', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
});

export const externalSystems = externalSystemsTable.table;
export const externalSystemsHistory = externalSystemsTable.historyTable;

export type ExternalSystem = typeof externalSystems.$inferSelect;
export type NewExternalSystem = typeof externalSystems.$inferInsert;
