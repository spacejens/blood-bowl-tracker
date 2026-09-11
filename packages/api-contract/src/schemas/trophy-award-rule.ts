import { z } from 'zod';

/**
 * Ask the server to fill in whatever trophy awards this competition's source
 * importer did not record, from the statistics already imported for it. The
 * whole rule — which trophies apply, which are already awarded, and how each
 * winner is determined — lives server-side, so the caller sends nothing but
 * the competition.
 */
export const ComputeMissingTrophyAwardsSchema = z.object({
  competitionId: z.number().int(),
});

/**
 * What the call did. `createdAwardCount` counts only awards that did not
 * already exist, so a re-import of an unchanged competition reports zero
 * rather than re-counting its own earlier work.
 */
export const ComputeMissingTrophyAwardsResultSchema = z.object({
  competitionId: z.number().int(),
  createdAwardCount: z.number().int(),
  awardedTrophyIds: z.array(z.number().int()),
});

export type ComputeMissingTrophyAwards = z.infer<
  typeof ComputeMissingTrophyAwardsSchema
>;
export type ComputeMissingTrophyAwardsResult = z.infer<
  typeof ComputeMissingTrophyAwardsResultSchema
>;
