import { serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { positions } from './positions';
import { teams } from './teams';

export const players = gameData.table('players', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  teamId: integer('team_id')
    .references(() => teams.id)
    .notNull(),
  positionId: integer('position_id')
    .references(() => positions.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
