import { externalIdsTable } from './external-ids-table';
import { gameData } from './pg-schema';
import { rulesSets } from './rules-sets';

const rulesSetExternalIdsTable = externalIdsTable(
  gameData,
  'rules_sets_external_ids',
  {
    key: 'rulesSetId',
    columnName: 'rules_set_id',
    references: () => rulesSets.id,
  },
);

export const rulesSetExternalIds = rulesSetExternalIdsTable.table;
export const rulesSetExternalIdsHistory = rulesSetExternalIdsTable.historyTable;

export type RulesSetExternalId = typeof rulesSetExternalIds.$inferSelect;
export type NewRulesSetExternalId = typeof rulesSetExternalIds.$inferInsert;
