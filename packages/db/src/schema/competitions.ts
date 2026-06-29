import { serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { eras } from './eras';

export const competitionTypeEnum = gameData.enum('competition_type', ['season', 'cup']);

export const competitions = gameData.table('competitions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: competitionTypeEnum('type').notNull(),
  eraId: integer('era_id').references(() => eras.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Competition = typeof competitions.$inferSelect;
export type NewCompetition = typeof competitions.$inferInsert;
