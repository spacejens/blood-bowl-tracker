import type { DbOrTx, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  eq,
  gt,
  ne,
  playerAdvancements,
  sql,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

/** The slots to close in one player's numbering. */
export interface PaidSlotClosing {
  playerId: number;
  /** The numbers the rows that just left the numbering held. */
  slots: number[];
}

/**
 * Keeps a player's advancement numbering free of gaps when stored rows leave
 * it: both the confirmed paid numbering (gained skills that are not free
 * extras, and characteristic increases, one shared numbering) and the
 * unconfirmed proxy numbering a source's list order gave.
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
    await this.shift(
      tx,
      closing,
      and(
        eq(playerAdvancements.playerId, closing.playerId),
        eq(playerAdvancements.orderConfirmed, true),
        eq(playerAdvancements.isFreeExtra, false),
        eq(playerAdvancements.removed, false),
        gt(playerAdvancements.advancementOrder, Math.min(...closing.slots)),
      ),
    );
  }

  /**
   * Move each of the player's unconfirmed, non-removed gained or increase
   * rows down by the number of closed slots numbered below it: the proxy
   * numbering a source's list order gave, once a row it counted leaves the
   * gained skills (a journeyman's Loner). Free extras move too, since their
   * number records where the source listed them. Runs on the caller's
   * transaction.
   */
  async closeUnconfirmed(tx: DbOrTx, closing: PaidSlotClosing): Promise<void> {
    if (closing.slots.length === 0) {
      return;
    }
    await this.shift(
      tx,
      closing,
      and(
        eq(playerAdvancements.playerId, closing.playerId),
        eq(playerAdvancements.orderConfirmed, false),
        eq(playerAdvancements.removed, false),
        ne(playerAdvancements.source, 'starting'),
        gt(playerAdvancements.advancementOrder, Math.min(...closing.slots)),
      ),
    );
  }

  /** One update moving each filtered row down by the closed slots below it. */
  private async shift(
    tx: DbOrTx,
    closing: PaidSlotClosing,
    filter: SQL | undefined,
  ): Promise<void> {
    const order = playerAdvancements.advancementOrder;
    const shift = sql.join(
      closing.slots.map((slot) => sql`(${order} > ${slot})::int`),
      sql` + `,
    );
    await tx
      .update(playerAdvancements)
      .set({ advancementOrder: sql`${order} - (${shift})` })
      .where(filter);
  }
}
