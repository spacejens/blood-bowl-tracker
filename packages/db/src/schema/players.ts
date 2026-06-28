import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { teams } from './teams';

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  teamId: integer('team_id').references(() => teams.id).notNull(),
  position: varchar('position', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
