import { externalIdsTable } from './external-ids-table';
import { gameData } from './pg-schema';
import { players } from './players';

const playerExternalIdsTable = externalIdsTable(
  gameData,
  'players_external_ids',
  {
    key: 'playerId',
    columnName: 'player_id',
    references: () => players.id,
  },
);

export const playerExternalIds = playerExternalIdsTable.table;
export const playerExternalIdsHistory = playerExternalIdsTable.historyTable;

export type PlayerExternalId = typeof playerExternalIds.$inferSelect;
export type NewPlayerExternalId = typeof playerExternalIds.$inferInsert;
