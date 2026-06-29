import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { races } from './races';

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  raceId: integer('race_id').references(() => races.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
