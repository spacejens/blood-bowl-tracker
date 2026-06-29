import { serial, varchar, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';

export const coaches = gameData.table('coaches', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Coach = typeof coaches.$inferSelect;
export type NewCoach = typeof coaches.$inferInsert;
