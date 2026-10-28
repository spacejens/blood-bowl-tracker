import { ADVANCEMENT_KINDS } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

/** See `ADVANCEMENT_KINDS` in `@blood-bowl-tracker/domain-enums`. */
export const AdvancementKindSchema = z.enum(ADVANCEMENT_KINDS);

/**
 * The SPP cost of one advancement under one rules set. `advancementNumber`
 * is 1-based (the nth advancement a player gains, skills and characteristic
 * increases alike); `sppCost` is that advancement's own cost -- the gap to
 * the previous threshold -- not a cumulative threshold. Both are positive.
 *
 * `leagueId` is optional. Without it the cost is the rules set's own and
 * applies to every player under it; with it the cost is a league house rule
 * that applies only to that league's players, in addition to the rules
 * set's costs. `skillId` names the skill a `granted_skill` advancement
 * grants; the server rejects a `granted_skill` cost without one and a skill
 * on any other kind.
 */
export const AdvancementCostEntrySchema = z.object({
  rulesSetId: z.number().int(),
  leagueId: z.number().int().optional(),
  advancementNumber: z.number().int().positive(),
  advancementKind: AdvancementKindSchema,
  skillId: z.number().int().optional(),
  sppCost: z.number().int().positive(),
});

/**
 * Not an upsert: a cost has no external ids (its natural key is the rules
 * set / league / advancement number / kind), so there is no entity+created
 * shape to return and no external-id conflict to detect -- the same reason
 * `sppAwardValues.sync` is its own procedure.
 */
export const SyncAdvancementCostsSchema = z.object({
  costs: z.array(AdvancementCostEntrySchema),
});

export const SyncAdvancementCostsResultSchema = z.object({
  advancementCostIds: z.array(z.number()),
});

export type AdvancementCostEntry = z.infer<typeof AdvancementCostEntrySchema>;
export type SyncAdvancementCosts = z.infer<typeof SyncAdvancementCostsSchema>;
export type SyncAdvancementCostsResult = z.infer<
  typeof SyncAdvancementCostsResultSchema
>;
