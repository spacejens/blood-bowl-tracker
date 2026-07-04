import { serial, varchar, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';

export const externalSystems = gameData.table('external_systems', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ExternalSystem = typeof externalSystems.$inferSelect;
export type NewExternalSystem = typeof externalSystems.$inferInsert;
