import type {
  ImportError,
  PlayerSkillEntry,
  SyncPlayerSkillsResult,
  UnspentSppSnapshot,
} from '@blood-bowl-tracker/api-contract';
import type { PlayerCharacteristicCounts } from '@blood-bowl-tracker/domain-enums';
import {
  AdvancementOrderDeductionService,
  PlayerAdvancementReadsService,
  PlayerSkillsService,
  UnspentSppService,
} from '@blood-bowl-tracker/game-data';
import { UpsertRecorderService } from '@blood-bowl-tracker/import-shared';
import { Injectable } from '@nestjs/common';

import type { LiveAdvancementPlan } from './tp-advancement-order.service';
import { TpAdvancementOrderService } from './tp-advancement-order.service';

/** Options for {@link TpLiveAdvancementSyncService.syncPlayer}. */
export interface LivePlayerSyncOptions {
  player: { id: number; name: string };
  playerId: number;
  skillEntries: PlayerSkillEntry[];
  increases: PlayerCharacteristicCounts | undefined;
  /** TP's unspent figure for the player, with the total reported beside it. */
  snapshot: UnspentSppSnapshot | undefined;
  errors: ImportError[];
  /**
   * True for the bulk import, which sends a player with a stored confirmed
   * paid advancement as TP lists him.
   */
  bulk?: boolean;
}

/**
 * Writes one player's advancements for the TP roster import, live and bulk
 * alike. Reads what is stored, flags each skill the write will store as a
 * free extra (PlayerAdvancementReadsService.resolveFreeExtras, the same rule
 * PlayerSkillsService.sync applies), lets TpAdvancementOrderService decide
 * each entry's order, and writes the entries. When new advancements are pending
 * (several, or a lone one while TP's spend is known), it asks
 * AdvancementOrderDeductionService which order the SPP TP reports as spent
 * allows, reading the player's advancement inputs after the first write so the
 * new rows (and their skill categories) are part of them, and writes the
 * deduced order confirmed. Without one answer the unconfirmed write stands.
 * A player with nothing stored has the order of every paid advancement
 * deduced the same way, and so does a bulk player with no stored confirmed
 * paid advancement: his stored unconfirmed rows are renumbered from 1 by the
 * first write and confirmed by the second.
 */
@Injectable()
export class TpLiveAdvancementSyncService {
  constructor(
    private readonly reads: PlayerAdvancementReadsService,
    private readonly playerSkills: PlayerSkillsService,
    private readonly order: TpAdvancementOrderService,
    private readonly unspentSpp: UnspentSppService,
    private readonly deduction: AdvancementOrderDeductionService,
    private readonly runner: UpsertRecorderService,
  ) {}

  /**
   * True when the player's entries were written, whether or not an order
   * was deduced; false when the stored rows or free extras could not be read
   * or the first write failed (each recorded as an error).
   */
  async syncPlayer(options: LivePlayerSyncOptions): Promise<boolean> {
    const { player, playerId, skillEntries, increases, errors } = options;
    const stored = await this.runner.record({
      run: () => this.reads.listStoredAdvancements(playerId),
      item: { lineUpId: player.id, playerId },
      errors,
      buildErrorMessage: (error) =>
        `Failed to read the stored advancements of player "${player.name}" (${player.id}): ${this.runner.messageOf(error)}`,
    });
    if (stored === undefined) {
      return false;
    }
    // The write stores some skills TP does not flag as free extras (a gained
    // Hatred, a trophy-granted skill); the plan must not number them as paid.
    const resolvedEntries = await this.runner.record({
      run: () => this.reads.resolveFreeExtras(skillEntries),
      item: { lineUpId: player.id, playerId },
      errors,
      buildErrorMessage: (error) =>
        `Failed to read the free extras of player "${player.name}" (${player.id}): ${this.runner.messageOf(error)}`,
    });
    if (resolvedEntries === undefined) {
      return false;
    }
    const plan = this.order.liveEntries({
      playerId,
      skillEntries: resolvedEntries,
      increases,
      stored,
      checkSpend: this.spent(options.snapshot) !== undefined,
      ...(options.bulk === true ? { bulk: true } : {}),
    });
    const written = await this.write(options, plan.entries);
    if (written === undefined) {
      return false;
    }
    const confirmed = await this.deducedEntries(options, {
      plan,
      rowIds: written.playerSkillIds,
    });
    if (confirmed !== undefined) {
      await this.write(options, confirmed);
    }
    return true;
  }

  /** The plan's entries with the deduced order confirmed, or undefined when none is known. */
  private async deducedEntries(
    options: LivePlayerSyncOptions,
    { plan, rowIds }: { plan: LiveAdvancementPlan; rowIds: number[] },
  ): Promise<PlayerSkillEntry[] | undefined> {
    const { playerId, player, errors } = options;
    const spent = this.spent(options.snapshot);
    if (plan.pendingIndexes.length === 0 || spent === undefined) {
      return undefined;
    }
    // A failed read leaves no rules set, so the deduction finds no fit.
    const inputs = await this.runner.record({
      run: () => this.unspentSpp.advancementInputsForPlayers([playerId]),
      item: { lineUpId: player.id, playerId },
      errors,
      buildErrorMessage: (error) =>
        `Failed to price the new advancements of player "${player.name}" (${player.id}): ${this.runner.messageOf(error)}`,
    });
    const numbers = this.deduction.deduce({
      rulesSets: inputs?.get(playerId) ?? [],
      newRowIds: plan.pendingIndexes.map((index) => rowIds[index]),
      firstNumber: plan.firstNumber,
      spent,
    });
    if (numbers === undefined) {
      return undefined;
    }
    return plan.entries.map((entry, index) => {
      const number = plan.pendingIndexes.includes(index)
        ? numbers.get(rowIds[index])
        : undefined;
      return number === undefined
        ? entry
        : { ...entry, advancementOrder: number, orderConfirmed: true };
    });
  }

  /** The SPP TP reports as spent, or undefined without a consistent snapshot. */
  private spent(snapshot: UnspentSppSnapshot | undefined): number | undefined {
    if (
      snapshot === undefined ||
      snapshot.unspentSpp < 0 ||
      snapshot.unspentSpp > snapshot.snapshotSppTotal
    ) {
      return undefined;
    }
    return snapshot.snapshotSppTotal - snapshot.unspentSpp;
  }

  private write(
    options: LivePlayerSyncOptions,
    entries: PlayerSkillEntry[],
  ): Promise<SyncPlayerSkillsResult | undefined> {
    const { player, playerId, increases, errors } = options;
    return this.runner.record({
      run: () =>
        this.playerSkills.sync({
          entries,
          ...(increases === undefined
            ? {}
            : { characteristicPlayerIds: [playerId] }),
        }),
      item: { lineUpId: player.id, playerId },
      errors,
      buildErrorMessage: (error) =>
        `Failed to write ${entries.length} advancement(s) of player "${player.name}" (${player.id}): ${this.runner.messageOf(error)}`,
    });
  }
}
