import { competitionGroups } from './competition-groups';
import { externalIdsTable } from './external-ids-table';
import { gameData } from './pg-schema';

const competitionGroupExternalIdsTable = externalIdsTable(
  gameData,
  'competition_groups_external_ids',
  {
    key: 'competitionGroupId',
    columnName: 'competition_group_id',
    references: () => competitionGroups.id,
  },
);

export const competitionGroupExternalIds =
  competitionGroupExternalIdsTable.table;
export const competitionGroupExternalIdsHistory =
  competitionGroupExternalIdsTable.historyTable;

export type CompetitionGroupExternalId =
  typeof competitionGroupExternalIds.$inferSelect;
export type NewCompetitionGroupExternalId =
  typeof competitionGroupExternalIds.$inferInsert;
