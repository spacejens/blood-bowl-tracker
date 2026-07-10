import { externalIdsTable } from './external-ids-table';
import { gameData } from './pg-schema';
import { teams } from './teams';

const teamExternalIdsTable = externalIdsTable(gameData, 'teams_external_ids', {
  key: 'teamId',
  columnName: 'team_id',
  references: () => teams.id,
});

export const teamExternalIds = teamExternalIdsTable.table;
export const teamExternalIdsHistory = teamExternalIdsTable.historyTable;

export type TeamExternalId = typeof teamExternalIds.$inferSelect;
export type NewTeamExternalId = typeof teamExternalIds.$inferInsert;
