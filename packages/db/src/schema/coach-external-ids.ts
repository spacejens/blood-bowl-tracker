import { serial, varchar, integer, unique } from 'drizzle-orm/pg-core';
import { gameData } from './pg-schema';
import { coaches } from './coaches';
import { externalSystems } from './external-systems';
import { historyTrackedTable } from './history';

const coachExternalIdsTable = historyTrackedTable(
  gameData,
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
  },
  (t) => ({
    uniqueExternalId: unique(
      'coach_external_ids_external_system_id_external_id_unique',
    ).on(t.externalSystemId, t.externalId),
  }),
);

export const coachExternalIds = coachExternalIdsTable.table;
export const coachExternalIdsHistory = coachExternalIdsTable.historyTable;

export type CoachExternalId = typeof coachExternalIds.$inferSelect;
export type NewCoachExternalId = typeof coachExternalIds.$inferInsert;
