import { KEYWORD_KINDS } from '@blood-bowl-tracker/domain-enums';
import { serial, varchar } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { gameData } from './pg-schema';

/**
 * See `KEYWORD_KINDS` in `@blood-bowl-tracker/domain-enums` for what each
 * kind means.
 */
export const keywordKindEnum = gameData.enum('keyword_kind', KEYWORD_KINDS);

/**
 * The catalogue of keywords — Goblin, Undead, Big Guy and so on. Species
 * keywords are BB2025-only; positional keywords (including Big Guy) also
 * appear under DB2021, and Big Guy alone also appears under BB2020.
 *
 * A keyword carries a name and a kind, and nothing else. Unlike a skill's
 * category, a keyword's kind does not vary between rules sets: kind is a
 * property of the catalogue row itself, so the same keyword recorded against
 * positions under several rules sets is always the same row with the same
 * kind. Which positions carry which keyword is recorded per rules set on
 * `position_rules_set_keywords`, for the same reason a position's
 * characteristics live on `position_rules_sets`.
 *
 * The catalogue is hand-curated (tools/import-manual): TP publishes only
 * numeric codes, never names, so the names cannot be derived from imported
 * data.
 */
const keywordsTable = historyTrackedTable({
  schema: gameData,
  name: 'keywords',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    kind: keywordKindEnum('kind').notNull(),
  },
});

export const keywords = keywordsTable.table;
export const keywordsHistory = keywordsTable.historyTable;

export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
