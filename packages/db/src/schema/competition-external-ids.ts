import { competitions } from './competitions';
import { externalIdsTable } from './external-ids-table';
import { gameData } from './pg-schema';

const competitionExternalIdsTable = externalIdsTable(
  gameData,
  'competitions_external_ids',
  {
    key: 'competitionId',
    columnName: 'competition_id',
    references: () => competitions.id,
  },
);

export const competitionExternalIds = competitionExternalIdsTable.table;
export const competitionExternalIdsHistory =
  competitionExternalIdsTable.historyTable;

export type CompetitionExternalId =
  typeof competitionExternalIds.$inferSelect;
export type NewCompetitionExternalId =
  typeof competitionExternalIds.$inferInsert;
