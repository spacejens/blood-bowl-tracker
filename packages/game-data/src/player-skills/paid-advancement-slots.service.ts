import type { DbOrTx } from '@blood-bowl-tracker/db';
import { and, eq, gt, playerAdvancements, sql } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

/** The slots to close in one player's confirmed paid numbering. */
export interface PaidSlotClosing {
  playerId: number;
  /** The confirmed numbers rows that just became free extras held. */
  slots: number[];
}

/**
 * Keeps a player's confirmed paid numbering (gained skills that are not free
 * extras, and characteristic increases, one shared numbering) free of gaps
 * when stored rows leave it.
 */
@Injectable()
export class PaidAdvancementSlotsService {
  /**
   * Move each of the player's confirmed, non-removed paid rows down by the
   * number of closed slots numbered below it. One update, so each row shifts
   * once by its full amount however many slots close. A starting row never
   * has an order, so the order bound alone leaves it out. Runs on the
   * caller's transaction.
   */
  async close(tx: DbOrTx, closing: PaidSlotClosing): Promise<void> {
    if (closing.slots.length === 0) {
      return;
    }
    const order = playerAdvancements.advancementOrder;
    const shift = sql.join(
      closing.slots.map((slot) => sql`(${order} > ${slot})::int`),
      sql` + `,
    );
    await tx
      .update(playerAdvancements)
      .set({ advancementOrder: sql`${order} - (${shift})` })
      .where(
        and(
          eq(playerAdvancements.playerId, closing.playerId),
          eq(playerAdvancements.orderConfirmed, true),
          eq(playerAdvancements.isFreeExtra, false),
          eq(playerAdvancements.removed, false),
          gt(order, Math.min(...closing.slots)),
        ),
      );
  }
}
