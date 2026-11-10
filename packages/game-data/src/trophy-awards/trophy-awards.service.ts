import type { UpsertTrophyAward } from '@blood-bowl-tracker/api-contract';
import type { Db, TrophyAward } from '@blood-bowl-tracker/db';
import {
  and,
  competitionGroups,
  competitions,
  DB,
  eq,
  getTableName,
  isNull,
  isUniqueViolationOn,
  players,
  skills,
  trophies,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { GameDataError } from '../shared/game-data-error';
import { UnspentSppDecisionService } from '../spp/unspent-spp-decision.service';

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
export class TrophyAwardRecipientMismatchError extends GameDataError {}

/**
 * The award's competition belongs to a different competition group than the
 * trophy is curated for (or the competition does not exist at all) — e.g. a
 * Major-Season trophy being awarded for a Minor-Season competition.
 *
 * Enforced here, not in the database and not per importer, for the same
 * reason `TrophyAwardRecipientMismatchError` is: Postgres cannot
 * cross-reference `trophies` and `competitions` from a plain `check()` on
 * `trophy_awards`, and putting it in this shared service is what makes it
 * apply to every importer — BBL, TP and any future one — instead of being
 * duplicated in each. It always signals a bug in the calling importer or its
 * curated data, never an expected-and-skippable condition.
 */
export class TrophyAwardCompetitionGroupMismatchError extends GameDataError {}

/**
 * The award names a granted skill it cannot carry: the award has no player
 * (only a player award can grant a skill), or the skill does not exist. Like
 * the two errors above, it is authored-data feedback the API reports as
 * BAD_REQUEST. The player is deliberately not required to hold the skill
 * already: holding the award is what entitles them to it.
 */
export class TrophyAwardGrantedSkillError extends GameDataError {}

@Injectable()
export class TrophyAwardsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly unspentSppDecision: UnspentSppDecisionService,
    private readonly playerSkills: PlayerSkillsService,
  ) {}

  /**
   * Record one trophy award, idempotently.
   *
   * The four natural-key ids identify the award. The only mutable field is
   * `grantedSkillId`, which overlays: when the award is already recorded and
   * the caller sent a granted skill (or `null`) that differs from the stored
   * one, that one column is updated; otherwise the existing row is returned
   * untouched.
   *
   * Insert-first rather than select-first, so the natural-key unique
   * constraint arbitrates and leaves no window for a concurrent importer to
   * slip a duplicate through; the SELECT runs only on the conflict path. That
   * constraint is NULLS NOT DISTINCT, which is what makes a team award
   * (always `playerId === null`) dedup at all.
   *
   * The insert deliberately carries no `ON CONFLICT DO NOTHING` clause; the
   * conflict is detected by catching the unique violation instead.
   * `trophy_awards` is history-tracked, and its `BEFORE INSERT` trigger writes
   * a `trophy_awards_history` row for every *attempted* row - including one
   * `DO NOTHING` then discards, leaving a history row whose deferred foreign
   * key back to `trophy_awards.id` has nothing to point at, which fails the
   * transaction at commit with a raw Postgres error on every re-import. A
   * plain insert that loses on the unique constraint raises the error itself,
   * so Postgres rolls the entire statement back, trigger writes included, and
   * the unique violation can be caught and handled. `spp-award-values.service.ts` and `upsert-by-external-ids.ts`
   * avoid the same trap the same way.
   *
   * A tie is not a special case: two players winning the same trophy in one
   * competition differ in `playerId` and each gets a row. No cutoff on tie
   * size is applied — real BBL data has ties of up to four.
   *
   * Writing a granted skill marks the winner's rows of that skill as free
   * extras (`PlayerSkillsService.markTrophyGranted`) and re-prices the
   * winner's stored unspent SPP
   * (`UnspentSppDecisionService.refreshFixedThreshold`).
   *
   * Must not be called inside a caller-supplied transaction without a
   * savepoint: a caught unique violation leaves that transaction aborted
   * (Postgres SQLSTATE 25P02) until rolled back, so the fallback SELECT right
   * after the catch would itself fail. `upsert-by-external-ids.ts`
   * deliberately catches its own equivalent violation outside its transaction
   * for exactly this reason.
   */
  async upsert(
    data: UpsertTrophyAward,
  ): Promise<{ trophyAward: TrophyAward; created: boolean }> {
    const trophy = await this.assertRecipientFitsTrophy(data);
    await this.assertScopeMatchesTrophy(data, trophy);
    const teamEraId = await this.resolveTeamEraId(data);
    await this.assertGrantedSkillFits(data);

    try {
      const [inserted] = await this.db
        .insert(trophyAwards)
        .values({
          trophyId: data.trophyId,
          competitionId: data.competitionId,
          teamEraId,
          playerId: data.playerId,
          grantedSkillId: data.grantedSkillId,
        })
        .returning();
      if (inserted === undefined) {
        throw new Error(
          `trophy_awards insert for trophy ${data.trophyId}, competition ` +
            `${data.competitionId}, team era ${teamEraId}, player ` +
            `${data.playerId ?? 'none'} reported success but returned no row.`,
        );
      }
      // A granted skill costs no SPP, so it changes what the winner's
      // fixed-threshold advancements cost. Only the manual import sends one,
      // and it runs no SPP adjustment sync, so the stored unspent SPP is
      // worked out again here rather than cleared.
      if (inserted.playerId !== null && inserted.grantedSkillId !== null) {
        await this.applyGrantedSkill(
          inserted.playerId,
          inserted.grantedSkillId,
        );
      }
      return { trophyAward: inserted, created: true };
    } catch (error) {
      // A unique violation on trophy_awards itself (never its primary key)
      // means the award is already recorded.
      if (!isUniqueViolationOn(error, getTableName(trophyAwards))) {
        throw error;
      }
      // The award is already recorded; fall through to read it back below.
    }

    const [existingAward] = await this.db
      .select()
      .from(trophyAwards)
      .where(
        and(
          eq(trophyAwards.trophyId, data.trophyId),
          eq(trophyAwards.competitionId, data.competitionId),
          eq(trophyAwards.teamEraId, teamEraId),
          data.playerId === null
            ? isNull(trophyAwards.playerId)
            : eq(trophyAwards.playerId, data.playerId),
        ),
      );

    if (existingAward === undefined) {
      throw new Error(
        `trophy_awards insert conflicted for trophy ${data.trophyId}, ` +
          `competition ${data.competitionId}, team era ${teamEraId}, ` +
          `player ${data.playerId ?? 'none'}, but no matching row could be ` +
          'read back.',
      );
    }

    return {
      trophyAward: await this.overlayGrantedSkill(
        existingAward,
        data.grantedSkillId,
      ),
      created: false,
    };
  }

  /**
   * A granted skill can only sit on a player award, and must name a real
   * skill. Runs only when the caller sends a skill id: an omitted value
   * leaves the stored one alone and `null` clears it, and neither needs
   * checking.
   */
  private async assertGrantedSkillFits(data: UpsertTrophyAward): Promise<void> {
    if (data.grantedSkillId === undefined || data.grantedSkillId === null) {
      return;
    }
    if (data.playerId === null) {
      throw new TrophyAwardGrantedSkillError(
        `Trophy ${data.trophyId}'s award in competition ` +
          `${data.competitionId} names granted skill ${data.grantedSkillId}, ` +
          'but only a player award can grant a skill.',
      );
    }
    const [skill] = await this.db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.id, data.grantedSkillId));
    if (skill === undefined) {
      throw new TrophyAwardGrantedSkillError(
        `Cannot grant skill ${data.grantedSkillId} with trophy ` +
          `${data.trophyId} to player ${data.playerId}: the skill does not ` +
          'exist.',
      );
    }
  }

  /**
   * The overlay half of the conflict path: an already-recorded award takes
   * the caller's granted skill when one was sent and differs, and is
   * returned untouched otherwise. This is what lets a curated granted skill
   * survive every later importer run, since importers never send one.
   *
   * A changed or cleared granted skill first unmarks the winner's rows of the
   * old skill (`PlayerSkillsService.unmarkTrophyGranted`), then marks the new
   * one and re-prices.
   *
   * A recorded award that grants a skill to a player is re-priced even when
   * nothing changes, so a refresh that failed after the original write is
   * repaired by the retry instead of leaving a stale fixed-threshold value.
   */
  private async overlayGrantedSkill(
    existing: TrophyAward,
    grantedSkillId: number | null | undefined,
  ): Promise<TrophyAward> {
    if (
      grantedSkillId === undefined ||
      grantedSkillId === existing.grantedSkillId
    ) {
      if (existing.playerId !== null && existing.grantedSkillId !== null) {
        await this.applyGrantedSkill(
          existing.playerId,
          existing.grantedSkillId,
        );
      }
      return existing;
    }
    const [updated] = await this.db
      .update(trophyAwards)
      .set({ grantedSkillId })
      .where(eq(trophyAwards.id, existing.id))
      .returning();
    if (updated === undefined) {
      throw new Error(
        `trophy_awards update of award ${existing.id}'s granted skill ` +
          'reported success but returned no row.',
      );
    }
    // The stored skill changed (set, changed or cleared): drop the old
    // skill's free flag, then mark the new one and re-price, as on insert.
    if (updated.playerId !== null) {
      if (existing.grantedSkillId !== null) {
        await this.playerSkills.unmarkTrophyGranted(
          updated.playerId,
          existing.grantedSkillId,
        );
      }
      await this.applyGrantedSkill(updated.playerId, updated.grantedSkillId);
    }
    return updated;
  }

  /**
   * Mark the winner's rows of the granted skill as free extras, then re-price
   * the winner's stored unspent SPP. Marking runs first so the re-pricing
   * sees it. A cleared granted skill only re-prices; unmarking the previous
   * skill is the caller's job and runs before this.
   */
  private async applyGrantedSkill(
    playerId: number,
    grantedSkillId: number | null,
  ): Promise<void> {
    if (grantedSkillId !== null) {
      await this.playerSkills.markTrophyGranted(playerId, grantedSkillId);
    }
    await this.unspentSppDecision.refreshFixedThreshold([playerId]);
  }

  /**
   * The team era the award row will carry. A caller that states one wins:
   * an explicit value is more authoritative than anything derived, and for a
   * team award it is the only possible source — there is no player to derive
   * from.
   *
   * A player award may leave it out, and this reads the winning player's own
   * `teamEraId` instead. That is a strict 1:1 derivation, not a guess: a
   * player never changes teams, so the award's team era *is* the player's own
   * (see `packages/db/src/schema/trophy-awards.ts`). Deriving it here is what
   * lets a caller that only knows the player — `tools/import-manual`'s
   * curated trophy awards, which resolve a player by external id — record an
   * award without a second round trip just to learn one team era.
   *
   * An unknown player is a `TrophyAwardRecipientMismatchError` for the same
   * reason an unknown *trophy* is one in `assertRecipientFitsTrophy`: the
   * award names a recipient that does not exist, which is authored-data
   * feedback the API reports as BAD_REQUEST. That lookup runs for every player
   * award, including one that states its own team era: a stated team era says
   * nothing about whether the player named beside it exists, and letting that
   * case through would leave the same bad reference to surface as a raw
   * foreign-key violation on insert rather than as the same clear error every
   * other unknown recipient gets.
   */
  private async resolveTeamEraId(data: UpsertTrophyAward): Promise<number> {
    if (data.playerId === null) {
      if (data.teamEraId !== undefined) {
        return data.teamEraId;
      }
      // Unreachable over the API: `UpsertTrophyAwardSchema`'s refinement
      // rejects a team award with no team era before the request gets here.
      // This is the backstop for a direct in-process caller, and a plain
      // Error because reaching it is a bug in that caller.
      throw new Error(
        `Cannot award trophy ${data.trophyId} in competition ` +
          `${data.competitionId}: a team award must state its team era, and ` +
          'there is no player to derive one from.',
      );
    }
    const [player] = await this.db
      .select({ teamEraId: players.teamEraId })
      .from(players)
      .where(eq(players.id, data.playerId));
    if (player === undefined) {
      throw new TrophyAwardRecipientMismatchError(
        `Cannot award trophy ${data.trophyId} to player ${data.playerId}: ` +
          'the player does not exist.',
      );
    }
    return data.teamEraId ?? player.teamEraId;
  }

  /**
   * Verifies the award's recipient fits the trophy, and hands the resolved
   * trophy's scope back so `assertScopeMatchesTrophy` can reuse it rather
   * than reading `trophies` a second time. Exactly one of the two scope
   * fields is non-null — the database's `trophies_group_or_league` check
   * guarantees it.
   */
  private async assertRecipientFitsTrophy(
    data: UpsertTrophyAward,
  ): Promise<{ competitionGroupId: number | null; leagueId: number | null }> {
    const [trophy] = await this.db
      .select({
        recipientKind: trophies.recipientKind,
        competitionGroupId: trophies.competitionGroupId,
        leagueId: trophies.leagueId,
      })
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
    return trophy;
  }

  /**
   * A trophy may only be awarded for a competition inside the scope it is
   * curated for. A group-scoped trophy compares the competition's own
   * `competitionGroupId` directly; a league-scoped one resolves the
   * competition's group's `leagueId` instead, since `competitions` carries no
   * league of its own. The trophy's scope is passed in, already read by
   * `assertRecipientFitsTrophy`; only the competition needs its own lookup.
   */
  private async assertScopeMatchesTrophy(
    data: UpsertTrophyAward,
    trophyScope: { competitionGroupId: number | null; leagueId: number | null },
  ): Promise<void> {
    if (trophyScope.competitionGroupId !== null) {
      const [competition] = await this.db
        .select({ competitionGroupId: competitions.competitionGroupId })
        .from(competitions)
        .where(eq(competitions.id, data.competitionId));

      if (competition === undefined) {
        throw new TrophyAwardCompetitionGroupMismatchError(
          `Cannot award trophy ${data.trophyId} in competition ` +
            `${data.competitionId}: the competition does not exist.`,
        );
      }
      if (competition.competitionGroupId !== trophyScope.competitionGroupId) {
        throw new TrophyAwardCompetitionGroupMismatchError(
          `Trophy ${data.trophyId} is curated for competition group ` +
            `${trophyScope.competitionGroupId}, but competition ` +
            `${data.competitionId} belongs to competition group ` +
            `${competition.competitionGroupId}.`,
        );
      }
      return;
    }

    const [competitionLeague] = await this.db
      .select({ leagueId: competitionGroups.leagueId })
      .from(competitions)
      .innerJoin(
        competitionGroups,
        eq(competitionGroups.id, competitions.competitionGroupId),
      )
      .where(eq(competitions.id, data.competitionId));

    if (competitionLeague === undefined) {
      throw new TrophyAwardCompetitionGroupMismatchError(
        `Cannot award trophy ${data.trophyId} in competition ` +
          `${data.competitionId}: the competition does not exist.`,
      );
    }
    if (competitionLeague.leagueId !== trophyScope.leagueId) {
      throw new TrophyAwardCompetitionGroupMismatchError(
        `Trophy ${data.trophyId} is curated for league ` +
          `${trophyScope.leagueId}, but competition ${data.competitionId} ` +
          `belongs to league ${competitionLeague.leagueId}.`,
      );
    }
  }
}
