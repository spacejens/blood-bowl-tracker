import { gameData } from './pg-schema';
import { coaches } from './coaches';
import { externalIdsTable } from './external-ids-table';

const coachExternalIdsTable = externalIdsTable(
  gameData,
  'coaches_external_ids',
  {
    key: 'coachId',
    columnName: 'coach_id',
    references: () => coaches.id,
  },
);

export const coachExternalIds = coachExternalIdsTable.table;
export const coachExternalIdsHistory = coachExternalIdsTable.historyTable;

export type CoachExternalId = typeof coachExternalIds.$inferSelect;
export type NewCoachExternalId = typeof coachExternalIds.$inferInsert;
