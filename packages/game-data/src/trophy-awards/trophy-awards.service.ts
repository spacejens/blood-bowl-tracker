import type { UpsertTrophyAward } from '@blood-bowl-tracker/api-contract';
import type { Db, TrophyAward } from '@blood-bowl-tracker/db';
import { DB, trophies, trophyAwards } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { UpsertConflictError } from '../shared/upsert-conflict-error';

/**
 * More than one existing `trophy_awards` row matches the natural key this
 * service dedups on. `trophy_awards` deliberately carries no database-level
 * unique constraint (see `packages/db/src/schema/trophy-awards.ts`), so that
 * is physically possible; it always means a bug upstream, and picking one of
 * the rows arbitrarily would hide it.
 */
export class TrophyAwardUpsertConflictError extends UpsertConflictError {}

/**
 * The award's `playerId` does not fit the referenced trophy's
 * `recipientKind`: set for a `team` trophy, or missing for a `player` one
 * (or the trophy does not exist at all).
 *
 * Enforced here rather than in the database for the same reason
 * `MatchCategoryMismatchError` is: Postgres cannot cross-reference
 * `trophies` from a plain `check()` on `trophy_awards`, and a trigger was
 * judged not worth the complexity (see `packages/db/src/schema/trophy-awards.ts`).
 * It always signals a bug in the calling importer, never an
 * expected-and-skippable condition.
 */
export class TrophyAwardRecipientMismatchError extends Error {}

@Injectable()
export class TrophyAwardsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Record one trophy award, idempotently.
   *
   * There is no update path: an award row is nothing but the four ids it
   * links, so "already recorded" means "identical" and the existing row is
   * returned untouched. That application-level dedup is what keeps a full
   * reimport from multiplying rows, since the table has no unique constraint
   * of its own.
   *
   * A tie is not a special case: two players winning the same trophy in the
   * same competition differ in `playerId`, so each simply gets its own row.
   * No cutoff on tie size is applied — real BBL data has ties of up to four.
   */
  async upsert(
    data: UpsertTrophyAward,
  ): Promise<{ trophyAward: TrophyAward; created: boolean }> {
    await this.assertRecipientFitsTrophy(data);

    const existing = await this.db
      .select()
      .from(trophyAwards)
      .where(
        and(
          eq(trophyAwards.trophyId, data.trophyId),
          eq(trophyAwards.competitionId, data.competitionId),
          eq(trophyAwards.teamEraId, data.teamEraId),
          data.playerId === null
            ? isNull(trophyAwards.playerId)
            : eq(trophyAwards.playerId, data.playerId),
        ),
      );

    if (existing.length > 1) {
      throw new TrophyAwardUpsertConflictError(
        `Multiple trophy awards already match trophy ${data.trophyId}, ` +
          `competition ${data.competitionId}, team era ${data.teamEraId} and ` +
          `player ${data.playerId ?? 'none'}: ` +
          `${existing.map((row) => row.id).join(', ')}`,
      );
    }

    if (existing[0]) {
      return { trophyAward: existing[0], created: false };
    }

    const inserted = await this.db
      .insert(trophyAwards)
      .values({
        trophyId: data.trophyId,
        competitionId: data.competitionId,
        teamEraId: data.teamEraId,
        playerId: data.playerId,
      })
      .returning();
    return { trophyAward: inserted[0], created: true };
  }

  private async assertRecipientFitsTrophy(
    data: UpsertTrophyAward,
  ): Promise<void> {
    const [trophy] = await this.db
      .select({ recipientKind: trophies.recipientKind })
      .from(trophies)
      .where(eq(trophies.id, data.trophyId));

    if (trophy === undefined) {
      throw new TrophyAwardRecipientMismatchError(
        `Cannot award trophy ${data.trophyId}: it does not exist.`,
      );
    }
    if (trophy.recipientKind === 'player' && data.playerId === null) {
      throw new TrophyAwardRecipientMismatchError(
        `Trophy ${data.trophyId} is awarded to a player, so the award must ` +
          'name one (playerId was null).',
      );
    }
    if (trophy.recipientKind === 'team' && data.playerId !== null) {
      throw new TrophyAwardRecipientMismatchError(
        `Trophy ${data.trophyId} is awarded to a team, so the award must not ` +
          `name a player (playerId was ${data.playerId}).`,
      );
    }
  }
}
