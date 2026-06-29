import { serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { races } from './races';

export const positions = gameData.table('positions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  raceId: integer('race_id').references(() => races.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
