import { externalIdsTable } from '../external-ids-table';
import { gameData } from './pg-schema';
import { skills } from './skills';

const skillExternalIdsTable = externalIdsTable(
  gameData,
  'skills_external_ids',
  {
    key: 'skillId',
    columnName: 'skill_id',
    references: () => skills.id,
  },
);

export const skillExternalIds = skillExternalIdsTable.table;
export const skillExternalIdsHistory = skillExternalIdsTable.historyTable;

export type SkillExternalId = typeof skillExternalIds.$inferSelect;
export type NewSkillExternalId = typeof skillExternalIds.$inferInsert;
