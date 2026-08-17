import type { UpsertTrophyAward } from '@blood-bowl-tracker/api-contract';
import type { Db, TrophyAward } from '@blood-bowl-tracker/db';
import {
  competitions,
  DB,
  eras,
  players,
  teamEras,
  teams,
  trophies,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

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

/**
 * One award of a trophy, as the trophy deepdive renders it: which competition
 * it was won in, which era that competition belongs to, which team won it,
 * and — for a player trophy — which player. `playerId`/`playerName` are
 * `null` for a team trophy. The era comes along so the deepdive can head each
 * run of same-era recipients with the era's name instead of repeating it on
 * every row.
 */
export type TrophyRecipient = {
  competitionName: string;
  competitionStartDate: string;
  eraId: number;
  eraName: string;
  teamId: number;
  teamName: string;
  playerId: number | null;
  playerName: string | null;
};

@Injectable()
export class TrophyAwardsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Every recipient of one trophy, most recent competition first, capped at
   * exactly `limit` rows — the caller asks for precisely what it intends to
   * show. There is deliberately no `limit + 1` overflow sentinel here: a
   * sentinel row can only ever prove "at least one more exists", so the
   * remainder derived from it would always be 1. Callers that need the real
   * remainder pair this with `countRecipients`.
   *
   * `players` is left-joined because a team trophy's award row carries no
   * player at all; `team_eras` is only a stepping stone to the team's id and
   * name, since the deepdive links to the team, not the era. `eras` is joined
   * through the competition so each recipient row knows which era it belongs to,
   * which is what lets the deepdive head one section per era. Ordering by
   * `eras.startDate` before `competitions.startDate` (both descending) is what
   * guarantees every recipient of one era stays adjacent in the result — the
   * deepdive's era-section grouping relies on that adjacency, and while real
   * eras never overlap in time (so ordering by competition date alone would
   * already produce the same result), sorting on the era's own date first
   * makes that guarantee explicit rather than incidental. `eras.id` sits
   * between them as a tiebreaker: `startDate` carries no uniqueness
   * constraint, so two distinct eras sharing a start date would otherwise
   * sort arbitrarily relative to each other and could interleave. Mirrors
   * the same fix in `CompetitionsService.listByCompetitionGroupChronological`.
   */
  listRecipients(trophyId: number, limit: number): Promise<TrophyRecipient[]> {
    return this.db
      .select({
        competitionName: competitions.name,
        competitionStartDate: competitions.startDate,
        eraId: eras.id,
        eraName: eras.name,
        teamId: teams.id,
        teamName: teams.name,
        playerId: players.id,
        playerName: players.name,
      })
      .from(trophyAwards)
      .innerJoin(competitions, eq(competitions.id, trophyAwards.competitionId))
      .innerJoin(eras, eq(eras.id, competitions.eraId))
      .innerJoin(teamEras, eq(teamEras.id, trophyAwards.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .leftJoin(players, eq(players.id, trophyAwards.playerId))
      .where(eq(trophyAwards.trophyId, trophyId))
      .orderBy(
        desc(eras.startDate),
        desc(eras.id),
        desc(competitions.startDate),
      )
      .limit(limit);
  }

  /**
   * How many times this trophy has ever been awarded. Kept separate from
   * `listRecipients` so the deepdive can render an exact "…and N more not
   * shown." remainder without fetching every row; a single trophy's award
   * count is one cheap aggregate, so there is no need for the approximate
   * "saturated window" wording `leaderboard.service.ts` falls back to.
   */
  async countRecipients(trophyId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(trophyAwards)
      .where(eq(trophyAwards.trophyId, trophyId));
    return row.count;
  }

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
