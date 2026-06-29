import { serial, varchar, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';

export const leagues = gameData.table('leagues', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
