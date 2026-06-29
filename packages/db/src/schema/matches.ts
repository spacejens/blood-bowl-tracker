import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { competitions } from './competitions';

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  competitionId: integer('competition_id').references(() => competitions.id).notNull(),
  playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
