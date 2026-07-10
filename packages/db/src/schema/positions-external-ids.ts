import { externalIdsTable } from './external-ids-table';
import { gameData } from './pg-schema';
import { positions } from './positions';

const positionExternalIdsTable = externalIdsTable(
  gameData,
  'positions_external_ids',
  {
    key: 'positionId',
    columnName: 'position_id',
    references: () => positions.id,
  },
);

export const positionExternalIds = positionExternalIdsTable.table;
export const positionExternalIdsHistory = positionExternalIdsTable.historyTable;

export type PositionExternalId = typeof positionExternalIds.$inferSelect;
export type NewPositionExternalId = typeof positionExternalIds.$inferInsert;
