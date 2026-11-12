import type { Db, DbOrTx } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  inArray,
  playerAdvancements,
  skills,
} from '@blood-bowl-tracker/db';
import type { PlayerSkillSource } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { PaidAdvancementSlotsService } from './paid-advancement-slots.service';

/** The skill a journeyman has for free while he stays one. */
const LONER_SKILL_NAME = 'Loner';

/** One stored Loner row of a player. */
interface LonerRow {
  id: number;
  source: PlayerSkillSource;
  advancementOrder: number | null;
  orderConfirmed: boolean;
  isFreeExtra: boolean;
  removed: boolean;
}

/**
 * Keeps a journeyman's Loner a starting skill while `players.is_journeyman`
 * is set, and retires that starting row when he is recruited. The importers
 * leave Loner out of a detected journeyman's gained skills, so this service
 * is the only writer of that row. A journeyman's Loner row stored as gained
 * (before he was marked) is turned into the starting one, and its number
 * leaves the numbering. Rows are never deleted: a recruit's starting Loner
 * is flagged `removed`, and revived if he is marked again. A gained Loner of
 * a player who is not a journeyman is never touched here: it stays a free
 * extra by the name rule. Does nothing while no skill is named Loner: an
 * import creates it with the positions that start with it, before any
 * player.
 */
@Injectable()
export class JourneymanLonerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly slots: PaidAdvancementSlotsService,
  ) {}

  /** Make sure the journeyman has his starting Loner, and no gained one. */
  async ensureStartingLoner(playerId: number): Promise<void> {
    const lonerId = await this.lonerSkillId();
    if (lonerId === undefined) {
      return;
    }
    await this.db.transaction(async (tx) => {
      const rows = await this.lonerRows(tx, playerId, lonerId);
      const gained = rows.filter(
        (row) => !row.removed && row.source !== 'starting',
      );
      if (gained.length > 0) {
        await tx
          .update(playerAdvancements)
          .set({
            source: 'starting',
            advancementOrder: null,
            orderConfirmed: false,
            isFreeExtra: false,
          })
          .where(
            inArray(
              playerAdvancements.id,
              gained.map((row) => row.id),
            ),
          );
        await this.closeSlots(tx, { playerId, rows: gained });
        return;
      }
      if (rows.some((row) => !row.removed && row.source === 'starting')) {
        return;
      }
      const retired = rows.find(
        (row) => row.removed && row.source === 'starting',
      );
      if (retired !== undefined) {
        await tx
          .update(playerAdvancements)
          .set({ removed: false })
          .where(eq(playerAdvancements.id, retired.id));
        return;
      }
      await tx
        .insert(playerAdvancements)
        .values({ playerId, skillId: lonerId, source: 'starting' });
    });
  }

  /**
   * Retire a recruited journeyman's starting Loner. A starting row holds no
   * number, so the recruit's numbering needs no change. A gained Loner, free
   * extra or not, is left alone: a source still listing one on the recruit
   * is recording a Loner he has for another reason.
   */
  async retireStartingLoner(playerId: number): Promise<void> {
    const lonerId = await this.lonerSkillId();
    if (lonerId === undefined) {
      return;
    }
    await this.db.transaction(async (tx) => {
      const rows = await this.lonerRows(tx, playerId, lonerId);
      const leaving = rows.filter(
        (row) => !row.removed && row.source === 'starting',
      );
      if (leaving.length === 0) {
        return;
      }
      await tx
        .update(playerAdvancements)
        .set({ removed: true })
        .where(
          inArray(
            playerAdvancements.id,
            leaving.map((row) => row.id),
          ),
        );
    });
  }

  private async lonerSkillId(): Promise<number | undefined> {
    const [skill] = await this.db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.name, LONER_SKILL_NAME))
      .limit(1);
    return skill?.id;
  }

  private lonerRows(
    tx: DbOrTx,
    playerId: number,
    lonerId: number,
  ): Promise<LonerRow[]> {
    return tx
      .select({
        id: playerAdvancements.id,
        source: playerAdvancements.source,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
        isFreeExtra: playerAdvancements.isFreeExtra,
        removed: playerAdvancements.removed,
      })
      .from(playerAdvancements)
      .where(
        and(
          eq(playerAdvancements.playerId, playerId),
          eq(playerAdvancements.skillId, lonerId),
        ),
      )
      .for('update');
  }

  /**
   * Close the numbers the converted gained rows held: a confirmed paid row's
   * in the confirmed paid numbering, an unconfirmed row's (a free extra's
   * included) in the proxy numbering.
   */
  private async closeSlots(
    tx: DbOrTx,
    { playerId, rows }: { playerId: number; rows: LonerRow[] },
  ): Promise<void> {
    const numbered = rows.filter(
      (row): row is LonerRow & { advancementOrder: number } =>
        row.source !== 'starting' && row.advancementOrder !== null,
    );
    await this.slots.close(tx, {
      playerId,
      slots: numbered
        .filter((row) => row.orderConfirmed && !row.isFreeExtra)
        .map((row) => row.advancementOrder),
    });
    await this.slots.closeUnconfirmed(tx, {
      playerId,
      slots: numbered
        .filter((row) => !row.orderConfirmed)
        .map((row) => row.advancementOrder),
    });
  }
}
