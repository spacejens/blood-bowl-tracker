import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/**
 * A curated competition group (issue #445): the recurring track a competition
 * instance belongs to, e.g. "Major Season" or "Chaos Cup".
 *
 * No source system names a group -- it exists purely as a curation decision
 * made in tools/import-manual -- but it still carries external ids, under the
 * synthetic "Name" system, so two independent importer processes can resolve
 * the same group onto the same row. `name`, `leagueId` and `externalIds` are
 * all required on upsert: there is no overlay use case, because the only
 * writer restates every field on every run. `externalIds` (min 1) is the
 * load-bearing one -- upsert matches an existing row by external id, never by
 * name, which is what makes re-running tools/import-manual (whose phases run
 * as separate processes) resolve the same curated group onto the same row
 * instead of duplicating it.
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
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type CompetitionGroup = z.infer<typeof CompetitionGroupSchema>;
export type UpsertCompetitionGroup = z.infer<
  typeof UpsertCompetitionGroupSchema
>;
