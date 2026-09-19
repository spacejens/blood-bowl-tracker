import { externalIdsTable } from '../external-ids-table';
import { keywords } from './keywords';
import { gameData } from './pg-schema';

const keywordExternalIdsTable = externalIdsTable(
  gameData,
  'keywords_external_ids',
  {
    key: 'keywordId',
    columnName: 'keyword_id',
    references: () => keywords.id,
  },
);

export const keywordExternalIds = keywordExternalIdsTable.table;
export const keywordExternalIdsHistory = keywordExternalIdsTable.historyTable;

export type KeywordExternalId = typeof keywordExternalIds.$inferSelect;
export type NewKeywordExternalId = typeof keywordExternalIds.$inferInsert;
