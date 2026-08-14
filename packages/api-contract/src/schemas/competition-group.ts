import { z } from 'zod';

/**
 * A curated competition group (issue #445): the recurring track a competition
 * instance belongs to, e.g. "Major Season" or "Chaos Cup".
 *
 * Unlike every other curated entity, a competition group has no external ids
 * at all -- it exists purely as a curation decision made in
 * tools/import-manual, never mirrored from a source system. `name` is
 * therefore its identity, and both fields are required on upsert: there is no
 * overlay use case, because the only writer restates every field on every run.
 */
export const CompetitionGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  leagueId: z.number(),
  createdAt: z.coerce.date(),
});

export const UpsertCompetitionGroupSchema = z.object({
  name: z.string().min(1),
  leagueId: z.number().int(),
});

/**
 * The contract's only read procedure. It exists because tools/import-manual
 * runs its two data directories as separate processes: the
 * after-other-importers run needs the ids of groups curated in the
 * before-other-importers run, and re-declaring the catalog in both directories
 * would be a drift hazard. Only id and name are returned -- that is all the
 * caller resolves against.
 */
export const CompetitionGroupListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const CompetitionGroupListSchema = z.array(
  CompetitionGroupListItemSchema,
);

/** No filters yet: the only caller wants the whole (16-row) catalog. */
export const ListCompetitionGroupsSchema = z.object({});

export type CompetitionGroup = z.infer<typeof CompetitionGroupSchema>;
export type UpsertCompetitionGroup = z.infer<
  typeof UpsertCompetitionGroupSchema
>;
export type CompetitionGroupListItem = z.infer<
  typeof CompetitionGroupListItemSchema
>;
