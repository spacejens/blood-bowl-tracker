import { eras } from './eras';
import { externalIdsTable } from './external-ids-table';
import { gameData } from './pg-schema';

const eraExternalIdsTable = externalIdsTable(gameData, 'eras_external_ids', {
  key: 'eraId',
  columnName: 'era_id',
  references: () => eras.id,
});

export const eraExternalIds = eraExternalIdsTable.table;
export const eraExternalIdsHistory = eraExternalIdsTable.historyTable;

export type EraExternalId = typeof eraExternalIds.$inferSelect;
export type NewEraExternalId = typeof eraExternalIds.$inferInsert;
