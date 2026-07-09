import { gameData } from './pg-schema';
import { leagues } from './leagues';
import { externalIdsTable } from './external-ids-table';

const leagueExternalIdsTable = externalIdsTable(
  gameData,
  'leagues_external_ids',
  {
    key: 'leagueId',
    columnName: 'league_id',
    references: () => leagues.id,
  },
);

export const leagueExternalIds = leagueExternalIdsTable.table;
export const leagueExternalIdsHistory = leagueExternalIdsTable.historyTable;

export type LeagueExternalId = typeof leagueExternalIds.$inferSelect;
export type NewLeagueExternalId = typeof leagueExternalIds.$inferInsert;
