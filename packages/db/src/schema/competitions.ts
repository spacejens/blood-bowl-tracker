import { pgTable, serial, varchar, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { eras } from './eras';

export const competitionTypeEnum = pgEnum('competition_type', ['season', 'cup']);

export const competitions = pgTable('competitions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: competitionTypeEnum('type').notNull(),
  eraId: integer('era_id').references(() => eras.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Competition = typeof competitions.$inferSelect;
export type NewCompetition = typeof competitions.$inferInsert;
