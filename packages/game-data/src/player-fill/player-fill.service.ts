import type {
  ExternalId,
  FillIncompletePlayer,
  FillIncompletePlayerResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { PlayerCharacteristicsValidationService } from '../players/player-characteristics-validation.service';
import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import { IncompletePlayerFillError } from '../shared/incomplete-player-fill-error';
import { SppTotalsService } from '../spp/spp-totals.service';
import type { PlayerFillState } from './player-fill.types';
import { PlayerFillComparisonService } from './player-fill-comparison.service';
import { PlayerFillEntriesService } from './player-fill-entries.service';
import { PlayerFillSpendCheckService } from './player-fill-spend-check.service';
import { PlayerFillStateService } from './player-fill-state.service';

/**
 * Writes the complete data a manual import batch supplies for one existing
 * TP player still counted as incomplete (`players.fillIncomplete`; see
 * docs/import-manual/filling-missing-players.md).
 *
 * The player must exist, have a TP external id and not be a star player.
 * One no longer counted as incomplete (INCOMPLETE_PLAYER_CRITERIA, read by
 * PlayerFillStateService) is never written: stored exactly as the entry
 * would leave him (a re-run), the answer is `unchanged`; otherwise the entry
 * is refused. For an incomplete player, every stored non-default value must
 * agree with the entry (PlayerFillComparisonService), the characteristics
 * must fit some rules set of his era (PlayerCharacteristicsValidationService)
 * and the advancements must cost exactly the SPP reported as spent
 * (PlayerFillSpendCheckService). Every check runs before any write, and a
 * refusal (IncompletePlayerFillError, or CharacteristicFormatMismatchError)
 * writes nothing.
 *
 * An accepted entry is written in one transaction: the advancement rows by
 * PlayerSkillsService.sync (starting skills as `starting`, advancements
 * confirmed and numbered from 1, his increases reconciled, the unspent SPP
 * kept), then the player's characteristics, SPP total, unspent SPP and
 * status. The SPP adjustment is computed the way the TP sync does it, total
 * minus the era-correct event sum (SppTotalsService), clamped at 0, and only
 * when none is stored. The journeyman flag is not touched.
 *
 * The reads happen before the transaction, so a concurrent write between
 * them is not excluded; manual imports run one at a time.
 */
@Injectable()
export class PlayerFillService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly state: PlayerFillStateService,
    private readonly entries: PlayerFillEntriesService,
    private readonly comparison: PlayerFillComparisonService,
    private readonly spendCheck: PlayerFillSpendCheckService,
    private readonly reads: PlayerAdvancementReadsService,
    private readonly characteristicsValidation: PlayerCharacteristicsValidationService,
    private readonly playerSkills: PlayerSkillsService,
    private readonly sppTotals: SppTotalsService,
  ) {}

  async fill(data: FillIncompletePlayer): Promise<FillIncompletePlayerResult> {
    const { playerId } = data;
    const refuse = (problem: string): IncompletePlayerFillError =>
      new IncompletePlayerFillError(`Player ${playerId}${problem}`);
    const state = await this.state.load(playerId);
    if (state === undefined) {
      throw refuse(' does not exist');
    }
    const { tpExternalId } = state;
    if (tpExternalId === undefined) {
      throw refuse(' is not a TP player');
    }
    if (state.isStarPlayer) {
      throw refuse(' is a star player');
    }
    const syncEntries = this.entries.entries(data);
    const planned = this.entries.plan(
      await this.reads.resolveFreeExtras(syncEntries),
    );
    const { contradictions, identical } = this.comparison.compare({
      fields: state.fields,
      rows: state.rows,
      data,
      planned,
    });
    if (!state.incomplete) {
      if (identical) {
        return { playerId, outcome: 'unchanged' };
      }
      const detail =
        contradictions.length === 0 ? '' : `: ${contradictions.join('; ')}`;
      throw refuse(
        ` already has complete data that differs from the entry${detail}`,
      );
    }
    if (contradictions.length > 0) {
      throw refuse(
        `: the entry contradicts stored data: ${contradictions.join('; ')}`,
      );
    }
    await this.validateCharacteristics(state, tpExternalId, data);
    const spendProblem = await this.spendCheck.problem({
      playerId,
      planned,
      sppTotal: data.sppTotal,
      unspentSpp: data.unspentSpp,
    });
    if (spendProblem !== undefined) {
      throw refuse(spendProblem);
    }
    const sppAdjustment = await this.sppAdjustment(state, data);
    await this.db.transaction(async (tx) => {
      await this.playerSkills.sync(
        { entries: syncEntries, characteristicPlayerIds: [playerId] },
        { keepUnspentSpp: true, tx },
      );
      await tx
        .update(players)
        .set({
          ...data.characteristics,
          sppTotal: data.sppTotal,
          unspentSpp: data.unspentSpp,
          status: data.status,
          sppAdjustment,
        })
        .where(eq(players.id, playerId));
    });
    return { playerId, outcome: 'filled' };
  }

  /**
   * Accept the characteristics when some rules set of the player's era
   * allows them; otherwise rethrow the last rules set's refusal.
   */
  private async validateCharacteristics(
    state: PlayerFillState,
    tpExternalId: ExternalId,
    data: FillIncompletePlayer,
  ): Promise<void> {
    let refusal: CharacteristicFormatMismatchError | undefined;
    for (const rulesSetId of state.rulesSetIds) {
      try {
        await this.characteristicsValidation.validate({
          externalIds: [tpExternalId],
          rulesSetId,
          ...data.characteristics,
        });
        return;
      } catch (error) {
        if (!(error instanceof CharacteristicFormatMismatchError)) {
          throw error;
        }
        refusal = error;
      }
    }
    throw (
      refusal ??
      new IncompletePlayerFillError(
        `Player ${data.playerId}'s era has no rules set to check the characteristics against`,
      )
    );
  }

  /** The stored adjustment, or total minus the era-correct event sum, at least 0. */
  private async sppAdjustment(
    state: PlayerFillState,
    data: FillIncompletePlayer,
  ): Promise<number> {
    if (state.fields.sppAdjustment !== null) {
      return state.fields.sppAdjustment;
    }
    const eraCorrect =
      (await this.sppTotals.totalsForPlayers([data.playerId])).get(
        data.playerId,
      ) ?? 0;
    return Math.max(0, data.sppTotal - eraCorrect);
  }
}
