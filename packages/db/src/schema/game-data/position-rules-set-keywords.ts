import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { keywords } from './keywords';
import { gameData } from './pg-schema';
import { positionRulesSets } from './position-rules-sets';

/**
 * One BB2025 keyword a position (or star player) carries under one rules set.
 *
 * Anchored to `position_rules_sets.id` rather than to duplicated
 * `position_id` / `rules_set_id` columns, exactly as
 * `position_rules_set_skills` is: a keyword can only be recorded against a
 * position/rules-set pair whose characteristics already exist, so keywords
 * cannot be synced ahead of the position itself.
 *
 * Many-to-many: TP publishes 1–3 keywords per BB2025 position (a Zombie
 * Lineman carries Human, Zombie and Undead together), and one keyword is
 * shared across positions from unrelated team races.
 *
 * A missing row means the position has no keyword recorded under that rules
 * set, which for every pre-BB2025 rules set is simply the whole truth: the
 * concept does not exist there, and TP's own data carries nothing to import.
 */
const positionRulesSetKeywordsTable = historyTrackedTable({
  schema: gameData,
  name: 'position_rules_set_keywords',
  columns: {
    id: serial('id').primaryKey(),
    positionRulesSetId: integer('position_rules_set_id')
      .references(() => positionRulesSets.id)
      .notNull(),
    keywordId: integer('keyword_id')
      .references(() => keywords.id)
      .notNull(),
  },
  extraConfig: (t) => ({
    // Deliberately no `_unique` suffix, unlike
    // `position_rules_set_skills_position_rules_set_id_skill_id_unique`:
    // appending it here would push the identifier past PostgreSQL's 63-byte
    // `NAMEDATALEN` limit, silently truncating it at apply time. Do not add
    // the suffix back to "fix" the inconsistency.
    uniquePositionRulesSetKeyword: unique(
      'position_rules_set_keywords_position_rules_set_id_keyword_id',
    ).on(t.positionRulesSetId, t.keywordId),
  }),
});

export const positionRulesSetKeywords = positionRulesSetKeywordsTable.table;
export const positionRulesSetKeywordsHistory =
  positionRulesSetKeywordsTable.historyTable;

export type PositionRulesSetKeyword =
  typeof positionRulesSetKeywords.$inferSelect;
export type NewPositionRulesSetKeyword =
  typeof positionRulesSetKeywords.$inferInsert;
