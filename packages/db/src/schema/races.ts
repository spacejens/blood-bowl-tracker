import { serial, varchar, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';

export const races = gameData.table('races', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;
