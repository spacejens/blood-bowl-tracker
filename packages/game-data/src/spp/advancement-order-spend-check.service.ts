import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, inArray, playerAdvancements } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { CuratedOrderStoredRow } from '../player-skills/curated-advancement-order-matcher.service';
import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import {
  AdvancementOrderDeductionService,
  MAX_DEDUCED,
} from './advancement-order-deduction.service';
import { UnspentSppService } from './unspent-spp.service';
import type { RulesSetAdvancementInput } from './unspent-spp.types';

/** One stored advancement row of a player, with its order. */
export interface SpendCheckRow extends CuratedOrderStoredRow {
  playerId: number;
  advancementOrder: number | null;
  orderConfirmed: boolean;
}

/** One player's stored rows, his free extras counted as free. */
export interface StoredWithFreeExtras {
  /**
   * Every stored row. One the free-extra rules make free has
   * `isFreeExtra: true` even while its stored flag is still unset.
   */
  stored: SpendCheckRow[];
  /** The ids of every row counted as free, flagged or not. */
  freeRowIds: Set<number>;
  /**
   * For each unflagged row counted as free, an entry that has the sync flag
   * it: the row's own natural key and source, no order, so its stored number
   * stays and is left unconfirmed.
   */
  flagEntries: PlayerSkillEntry[];
}

/** A player's paid advancement rows in the order to price, and his reported spend. */
export interface SpendCheckOrder {
  playerId: number;
  rowIdsInOrder: number[];
  freeRowIds: Set<number>;
  spent: number;
}

/** What a player's stored SPP figures say he spent on advancements. */
export type ReportedSpend =
  | { kind: 'unknown' }
  | { kind: 'spent'; spent: number }
  | { kind: 'inconsistent'; problem: string };

/**
 * Checks a complete advancement order against the SPP a player reports as
 * spent (stored total minus stored unspent): with every paid row ordered,
 * only that assignment can fit, priced by AdvancementOrderDeductionService
 * under the rules sets of his era. The stored gained skills the free-extra
 * rules make free (PlayerAdvancementReadsService.resolveFreeExtras) count as
 * free in the pricing even while their stored flag is unset. Used by the
 * curated order write and by the recheck after the SPP adjustments sync.
 * Problems are phrased to follow the player's name ("Player 12 has ...",
 * "Player 12: this order ..."). Reads are batched over the given players.
 */
@Injectable()
export class AdvancementOrderSpendCheckService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reads: PlayerAdvancementReadsService,
    private readonly unspentSpp: UnspentSppService,
    private readonly deduction: AdvancementOrderDeductionService,
  ) {}

  /**
   * Stored total minus stored unspent; unknown when either is missing
   * (nothing to check against), inconsistent when they contradict.
   */
  reportedSpend(player: {
    sppTotal: number | null;
    unspentSpp: number | null;
  }): ReportedSpend {
    const { sppTotal, unspentSpp } = player;
    if (sppTotal === null || unspentSpp === null) {
      return { kind: 'unknown' };
    }
    if (unspentSpp < 0 || unspentSpp > sppTotal) {
      return {
        kind: 'inconsistent',
        problem:
          ' has an unspent SPP figure outside 0 to the SPP total, so the order cannot be checked against it',
      };
    }
    return { kind: 'spent', spent: sppTotal - unspentSpp };
  }

  /**
   * Each player's stored rows, by player id; a player with no row is left
   * out. One read of the rows and one free-extra resolution for all players.
   */
  async storedWithFreeExtras(
    playerIds: number[],
  ): Promise<Map<number, StoredWithFreeExtras>> {
    const byPlayer = new Map<number, StoredWithFreeExtras>();
    if (playerIds.length === 0) {
      return byPlayer;
    }
    const rows = await this.db
      .select({
        id: playerAdvancements.id,
        playerId: playerAdvancements.playerId,
        skillId: playerAdvancements.skillId,
        characteristic: playerAdvancements.characteristic,
        attributeValue: playerAdvancements.attributeValue,
        source: playerAdvancements.source,
        isFreeExtra: playerAdvancements.isFreeExtra,
        removed: playerAdvancements.removed,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
      })
      .from(playerAdvancements)
      .where(inArray(playerAdvancements.playerId, playerIds));
    const unflagged = rows.flatMap((row) =>
      row.skillId === null ||
      row.source === 'starting' ||
      row.source === 'characteristic' ||
      row.isFreeExtra ||
      row.removed
        ? []
        : [{ row, skillId: row.skillId }],
    );
    const resolved = await this.reads.resolveFreeExtras(
      unflagged.map(({ row, skillId }) => ({
        playerId: row.playerId,
        skillId,
        source: row.source,
        attributeValue: row.attributeValue,
      })),
    );
    const newlyFree = new Set<number>();
    resolved.forEach((entry, at) => {
      if (entry.isFreeExtra === true) {
        const { row } = unflagged[at];
        newlyFree.add(row.id);
        this.group(byPlayer, row.playerId).flagEntries.push(entry);
      }
    });
    for (const row of rows) {
      const group = this.group(byPlayer, row.playerId);
      const free = row.isFreeExtra || newlyFree.has(row.id);
      group.stored.push(
        free === row.isFreeExtra ? row : { ...row, isFreeExtra: true },
      );
      if (free) {
        group.freeRowIds.add(row.id);
      }
    }
    return byPlayer;
  }

  /**
   * Why each order cannot cost its player's spend, by player id; a player
   * whose order fits is left out. One read of the pricing inputs for every
   * order that needs pricing.
   */
  async spendProblems(orders: SpendCheckOrder[]): Promise<Map<number, string>> {
    const problems = new Map<number, string>();
    const priced: SpendCheckOrder[] = [];
    for (const order of orders) {
      const count = order.rowIdsInOrder.length;
      if (count === 0) {
        // No paid advancement, so nothing can have been spent on one.
        if (order.spent !== 0) {
          problems.set(
            order.playerId,
            ` has no paid advancement, but ${order.spent} SPP reported as spent`,
          );
        }
      } else if (count > MAX_DEDUCED) {
        problems.set(
          order.playerId,
          ` has ${count} paid advancements; at most ${MAX_DEDUCED} can be checked`,
        );
      } else {
        priced.push(order);
      }
    }
    if (priced.length === 0) {
      return problems;
    }
    const inputs = await this.unspentSpp.advancementInputsForPlayers(
      priced.map((order) => order.playerId),
    );
    for (const order of priced) {
      const problem = this.pricingProblem(
        order,
        inputs.get(order.playerId) ?? [],
      );
      if (problem !== undefined) {
        problems.set(order.playerId, problem);
      }
    }
    return problems;
  }

  /** Why the order cannot cost the spend under the given rules sets, if it cannot. */
  private pricingProblem(
    order: SpendCheckOrder,
    playerRulesSets: RulesSetAdvancementInput[],
  ): string | undefined {
    const rulesSets = playerRulesSets.map((rulesSet) =>
      this.withFreeRows(rulesSet, order.freeRowIds),
    );
    if (rulesSets.length === 0) {
      return ' has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent';
    }
    // With every paid row ordered, only this assignment can fit.
    const fitted = this.deduction.deduce({
      rulesSets,
      newRowIds: order.rowIdsInOrder,
      orderedRowIds: order.rowIdsInOrder,
      firstNumber: 1,
      spent: order.spent,
    });
    return fitted === undefined
      ? `: this order cannot cost exactly the ${order.spent} SPP reported as spent under any rules set of the player's era`
      : undefined;
  }

  /** The rules set's input with the given rows marked as free extras. */
  private withFreeRows(
    rulesSet: RulesSetAdvancementInput,
    freeRowIds: Set<number>,
  ): RulesSetAdvancementInput {
    return {
      ...rulesSet,
      candidatesInput: {
        ...rulesSet.candidatesInput,
        skills: rulesSet.candidatesInput.skills.map((row) =>
          freeRowIds.has(row.id) && !row.isFreeExtra
            ? { ...row, isFreeExtra: true }
            : row,
        ),
      },
    };
  }

  /** The player's group, created empty on first use. */
  private group(
    byPlayer: Map<number, StoredWithFreeExtras>,
    playerId: number,
  ): StoredWithFreeExtras {
    const existing = byPlayer.get(playerId);
    if (existing !== undefined) {
      return existing;
    }
    const created: StoredWithFreeExtras = {
      stored: [],
      freeRowIds: new Set(),
      flagEntries: [],
    };
    byPlayer.set(playerId, created);
    return created;
  }
}
