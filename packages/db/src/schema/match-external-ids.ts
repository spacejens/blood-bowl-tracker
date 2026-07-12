import { externalIdsTable } from './external-ids-table';
import { matches } from './matches';
import { gameData } from './pg-schema';

const matchExternalIdsTable = externalIdsTable(gameData, 'matches_external_ids', {
  key: 'matchId',
  columnName: 'match_id',
  references: () => matches.id,
});

export const matchExternalIds = matchExternalIdsTable.table;
export const matchExternalIdsHistory = matchExternalIdsTable.historyTable;

export type MatchExternalId = typeof matchExternalIds.$inferSelect;
export type NewMatchExternalId = typeof matchExternalIds.$inferInsert;
