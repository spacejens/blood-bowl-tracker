import { integer, serial, varchar } from 'drizzle-orm/pg-core';

import { competitionGroups } from './competition-groups';
import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';

/**
 * Who a trophy is awarded to. A `team` trophy names a team era; a `player`
 * trophy names an individual player (whose team era is still recorded on the
 * award row — see `trophy-awards.ts`).
 */
export const trophyRecipientKindEnum = gameData.enum('trophy_recipient_kind', [
  'team',
  'player',
]);

/**
 * The curated catalog of known trophies. Deliberately has NO shared "Name"
 * external id, matching the precedent set for `competitions` by issue #285:
 * trophy identity is a curation decision, not something inferred from label
 * text, because superficially identical labels (e.g. "1st") can be genuinely
 * different trophies depending on which competition tier awarded them
 * (Major vs. Minor).
 *
 * A trophy's `trophies_external_ids` rows may legitimately be empty — see
 * `TrophiesService.upsert` in packages/game-data for how such a row stays
 * idempotent across imports.
 */
const trophiesTable = historyTrackedTable({
  schema: gameData,
  name: 'trophies',
  columns: {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    recipientKind: trophyRecipientKindEnum('recipient_kind').notNull(),
    // Free text describing the trophy's award criteria, translated from the
    // source league's own trophy legend pages. Nullable: a trophy may be
    // known by name before its criteria are. `varchar` rather than `text`
    // because no schema module in this package uses `text`.
    description: varchar('description', { length: 1024 }),
    // Which competition group this trophy can be awarded for (issue #445), so
    // #446 can consider only applicable trophies when awarding for a
    // competition. Same NOT NULL + default-1 rationale as
    // `competitions.competition_group_id`.
    competitionGroupId: integer('competition_group_id')
      .references(() => competitionGroups.id)
      .notNull()
      .default(1),
  },
});

export const trophies = trophiesTable.table;
export const trophiesHistory = trophiesTable.historyTable;

export type Trophy = typeof trophies.$inferSelect;
export type NewTrophy = typeof trophies.$inferInsert;
