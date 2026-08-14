import { externalIdsTable } from './external-ids-table';
import { gameData } from './pg-schema';
import { trophies } from './trophies';

const trophyExternalIdsTable = externalIdsTable(
  gameData,
  'trophies_external_ids',
  {
    key: 'trophyId',
    columnName: 'trophy_id',
    references: () => trophies.id,
  },
);

export const trophyExternalIds = trophyExternalIdsTable.table;
export const trophyExternalIdsHistory = trophyExternalIdsTable.historyTable;

export type TrophyExternalId = typeof trophyExternalIds.$inferSelect;
export type NewTrophyExternalId = typeof trophyExternalIds.$inferInsert;
