import {
  serial,
  varchar,
  integer,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { coaches } from './coaches';
import { externalSystems } from './external-systems';

export const coachExternalIds = gameData.table(
  'coach_external_ids',
  {
    id: serial('id').primaryKey(),
    coachId: integer('coach_id')
      .references(() => coaches.id)
      .notNull(),
    externalSystemId: integer('external_system_id')
      .references(() => externalSystems.id)
      .notNull(),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqueExternalId: unique(
      'coach_external_ids_external_system_id_external_id_unique',
    ).on(t.externalSystemId, t.externalId),
  }),
);

export type CoachExternalId = typeof coachExternalIds.$inferSelect;
export type NewCoachExternalId = typeof coachExternalIds.$inferInsert;
