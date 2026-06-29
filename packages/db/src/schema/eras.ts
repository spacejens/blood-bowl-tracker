import { pgTable, serial, varchar, integer, date, timestamp } from 'drizzle-orm/pg-core';
import { leagues } from './leagues';
import { rulesSets } from './rules-sets';

export const eras = pgTable('eras', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  leagueId: integer('league_id').references(() => leagues.id).notNull(),
  rulesSetId: integer('rules_set_id').references(() => rulesSets.id).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Era = typeof eras.$inferSelect;
export type NewEra = typeof eras.$inferInsert;
