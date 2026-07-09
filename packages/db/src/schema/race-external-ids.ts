import { gameData } from './pg-schema';
import { races } from './races';
import { externalIdsTable } from './external-ids-table';

const raceExternalIdsTable = externalIdsTable(gameData, 'races_external_ids', {
  key: 'raceId',
  columnName: 'race_id',
  references: () => races.id,
});

export const raceExternalIds = raceExternalIdsTable.table;
export const raceExternalIdsHistory = raceExternalIdsTable.historyTable;

export type RaceExternalId = typeof raceExternalIds.$inferSelect;
export type NewRaceExternalId = typeof raceExternalIds.$inferInsert;
