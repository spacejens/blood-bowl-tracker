import { z } from 'zod';

/**
 * One trophy actually handed out, in one competition, to one recipient.
 *
 * `teamEraId` is set even for player awards (a player never changes teams, so
 * the award's team era is the player's own) — see
 * `packages/db/src/schema/trophy-awards.ts`. There is no external-ids field:
 * this is a pure link row, identified by the four ids it points at.
 */
export const TrophyAwardSchema = z.object({
  id: z.number(),
  trophyId: z.number(),
  competitionId: z.number(),
  teamEraId: z.number(),
  playerId: z.number().nullable(),
  createdAt: z.coerce.date(),
});

/**
 * Every id is required except `playerId`, which defaults to `null` so a team
 * award can simply omit it.
 *
 * `playerId` must be non-null exactly when the referenced trophy's
 * `recipientKind` is `'player'`. That is a cross-entity invariant this schema
 * cannot express (it depends on another table's row), so it is validated in
 * `TrophyAwardsService` instead — the same documented precedent as
 * `matches.match_category` vs. its competition's type.
 */
export const UpsertTrophyAwardSchema = z.object({
  trophyId: z.number().int(),
  competitionId: z.number().int(),
  teamEraId: z.number().int(),
  playerId: z.number().int().nullable().default(null),
});

export type TrophyAward = z.infer<typeof TrophyAwardSchema>;
export type UpsertTrophyAward = z.infer<typeof UpsertTrophyAwardSchema>;
