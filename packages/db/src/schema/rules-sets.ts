import { serial, varchar, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';

export const rulesSets = gameData.table('rules_sets', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type RulesSet = typeof rulesSets.$inferSelect;
export type NewRulesSet = typeof rulesSets.$inferInsert;
