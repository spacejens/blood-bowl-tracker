import { sql } from 'drizzle-orm';
import { check, integer, serial, varchar } from 'drizzle-orm/pg-core';

import { competitionGroups } from './competition-groups';
import { historyTrackedTable } from './history';
import { leagues } from './leagues';
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
 * external id, matching the precedent set for `competitions`: trophy identity
 * is a curation decision, not something inferred from label
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
    // Which competition group this trophy can be awarded for. Nullable, and
    // mutually exclusive with `leagueId`: a recurring group-specific trophy
    // (e.g. "Major Gold") names a group here, while a lifetime-achievement
    // trophy that any competition in the league can award names a league
    // instead. Enforced by the `trophies_group_or_league` check below. No
    // default: an unspecified scope must fail loudly rather than silently
    // land in competition group 1.
    competitionGroupId: integer('competition_group_id').references(
      () => competitionGroups.id,
    ),
    // The league this trophy is awarded across, when it is not tied to one
    // competition group. Exactly one of this and `competitionGroupId` is set.
    leagueId: integer('league_id').references(() => leagues.id),
  },
  extraConfig: (t) => ({
    // A plain single-table check, unlike the cross-table comparisons
    // `trophy-awards.ts` and `matches.ts` note Postgres cannot express this
    // way, so it is enforced in the database rather than in application code.
    groupOrLeague: check(
      'trophies_group_or_league',
      sql`(${t.competitionGroupId} IS NOT NULL) != (${t.leagueId} IS NOT NULL)`,
    ),
  }),
});

export const trophies = trophiesTable.table;
export const trophiesHistory = trophiesTable.historyTable;

export type Trophy = typeof trophies.$inferSelect;
export type NewTrophy = typeof trophies.$inferInsert;
