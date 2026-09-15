import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { gameData } from './pg-schema';

/**
 * The catalogue of named player abilities — Block, Dodge, Regeneration and so
 * on. A skill carries only its name: the name is its identity across every
 * rules set that has it.
 *
 * Deliberately no category column. A skill's category can differ between
 * rules sets (BB2025 introduced Devious and moved existing skills into it),
 * so it lives on `skill_rules_sets`, exactly as a position's characteristics
 * live on `position_rules_sets` rather than on `positions`.
 */
const skillsTable = historyTrackedTable({
  schema: gameData,
  name: 'skills',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
  },
});

export const skills = skillsTable.table;
export const skillsHistory = skillsTable.historyTable;

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
