import { externalIdsTable } from './external-ids-table';
import { matchEvents } from './match-events';
import { gameData } from './pg-schema';

const matchEventExternalIdsTable = externalIdsTable(
  gameData,
  'match_events_external_ids',
  {
    key: 'matchEventId',
    columnName: 'match_event_id',
    references: () => matchEvents.id,
  },
);

export const matchEventExternalIds = matchEventExternalIdsTable.table;
export const matchEventExternalIdsHistory =
  matchEventExternalIdsTable.historyTable;

export type MatchEventExternalId = typeof matchEventExternalIds.$inferSelect;
export type NewMatchEventExternalId = typeof matchEventExternalIds.$inferInsert;
