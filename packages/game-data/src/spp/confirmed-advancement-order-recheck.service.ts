import type { AdvancementOrderProblem } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, inArray, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type {
  SpendCheckOrder,
  SpendCheckRow,
} from './advancement-order-spend-check.service';
import { AdvancementOrderSpendCheckService } from './advancement-order-spend-check.service';

/**
 * Rechecks the confirmed advancement orders of players whose SPP figures
 * were just stored. A curated order is written confirmed after the
 * one-for-one match alone when either figure is missing, and nothing else
 * looks at a confirmed order again; this runs the same spend check
 * (AdvancementOrderSpendCheckService) once both are stored. Only a player
 * with both figures and a complete order is checked: at least one active
 * paid row (not starting, not a free extra, the unflagged ones the
 * free-extra rules make free included) and every such row confirmed and
 * numbered. A contradiction is returned, never thrown, and the stored order
 * is left as it is. Reads are batched: one for the figures, one for the
 * rows, one for the pricing inputs.
 */
@Injectable()
export class ConfirmedAdvancementOrderRecheckService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly spendCheck: AdvancementOrderSpendCheckService,
  ) {}

  /** One problem per player whose complete confirmed order fails, by player id. */
  async recheck(playerIds: number[]): Promise<AdvancementOrderProblem[]> {
    if (playerIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({
        id: players.id,
        name: players.name,
        sppTotal: players.sppTotal,
        unspentSpp: players.unspentSpp,
      })
      .from(players)
      .where(inArray(players.id, playerIds));
    const known = rows.flatMap((row) => {
      const reported = this.spendCheck.reportedSpend(row);
      return reported.kind === 'unknown' ? [] : [{ row, reported }];
    });
    if (known.length === 0) {
      return [];
    }
    const storedByPlayer = await this.spendCheck.storedWithFreeExtras(
      known.map(({ row }) => row.id),
    );
    const problems = new Map<number, string>();
    const orders: SpendCheckOrder[] = [];
    for (const { row, reported } of known) {
      const stored = storedByPlayer.get(row.id);
      const rowIdsInOrder = this.confirmedOrder(stored?.stored ?? []);
      if (stored === undefined || rowIdsInOrder === undefined) {
        continue;
      }
      if (reported.kind === 'inconsistent') {
        problems.set(row.id, reported.problem);
      } else {
        orders.push({
          playerId: row.id,
          rowIdsInOrder,
          freeRowIds: stored.freeRowIds,
          spent: reported.spent,
        });
      }
    }
    for (const [playerId, problem] of await this.spendCheck.spendProblems(
      orders,
    )) {
      problems.set(playerId, problem);
    }
    return rows
      .flatMap((row) => {
        const problem = problems.get(row.id);
        return problem === undefined
          ? []
          : [
              {
                playerId: row.id,
                name: row.name,
                problem: this.standalone(problem),
              },
            ];
      })
      .sort((a, b) => a.playerId - b.playerId);
  }

  /**
   * The paid rows' ids by their stored number, when there is at least one
   * and every one is confirmed and numbered; otherwise undefined.
   */
  private confirmedOrder(stored: SpendCheckRow[]): number[] | undefined {
    const paid = stored.filter(
      (row) => row.source !== 'starting' && !row.isFreeExtra && !row.removed,
    );
    const numbered = paid.flatMap((row) =>
      row.orderConfirmed && row.advancementOrder !== null
        ? [{ id: row.id, order: row.advancementOrder }]
        : [],
    );
    if (paid.length === 0 || numbered.length !== paid.length) {
      return undefined;
    }
    return numbered.sort((a, b) => a.order - b.order).map(({ id }) => id);
  }

  /**
   * The spend check's problem, which is phrased to follow the player's name
   * (" has ..." or ": this order ..."), as a sentence of its own.
   */
  private standalone(problem: string): string {
    return problem.replace(/^:?\s*/, '');
  }
}
