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
 * `trophyId` and `competitionId` are always required. `playerId` defaults to
 * `null` so a team award can simply omit it, and `teamEraId` is required only
 * for a team award.
 *
 * `playerId` must be non-null exactly when the referenced trophy's
 * `recipientKind` is `'player'`. That is a cross-entity invariant this schema
 * cannot express (it depends on another table's row), so it is validated in
 * `TrophyAwardsService` instead — the same documented precedent as
 * `matches.match_category` vs. its competition's type.
 *
 * `teamEraId` is optional only when `playerId` names a player: the stored row
 * still always carries a team era (a player never changes teams, so a player
 * award's team era is the player's own — see
 * `packages/db/src/schema/trophy-awards.ts`), but that value is a strict 1:1
 * consequence of the player's own row, so `TrophyAwardsService` derives it
 * server-side rather than making every caller look it up first. A caller that
 * already knows the team era may still supply it, and its value wins. A team
 * award has no player to derive from, so it must still state one — which the
 * refinement below, not the service, rejects.
 */
export const UpsertTrophyAwardSchema = z
  .object({
    trophyId: z.number().int(),
    competitionId: z.number().int(),
    teamEraId: z.number().int().optional(),
    playerId: z.number().int().nullable().default(null),
  })
  .refine((v) => v.teamEraId !== undefined || v.playerId !== null, {
    message: 'teamEraId is required for a team award (playerId is null)',
    path: ['teamEraId'],
  });

export type TrophyAward = z.infer<typeof TrophyAwardSchema>;
export type UpsertTrophyAward = z.infer<typeof UpsertTrophyAwardSchema>;
