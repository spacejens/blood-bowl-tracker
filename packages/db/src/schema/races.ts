import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const races = pgTable('races', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Race = typeof races.$inferSelect;
export type NewRace = typeof races.$inferInsert;
