import type { Db, DbOrTx } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  playerAdvancements,
  players,
  positionRulesSets,
  positionRulesSetSkills,
  positions,
  skills,
  sql,
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
 * is the only writer of that row. When he has no starting Loner, a Loner
 * row stored as gained (before he was marked) is turned into the starting
 * one, and its number leaves the numbering. Rows are never deleted: a
 * recruit's starting Loner is flagged `removed`, and revived if he is marked
 * again. A gained Loner beside a starting one, or of a player who is not a
 * journeyman, is never touched here: it stays a free extra by the name rule.
 * A starting Loner the player's position starts with is never retired. Does
 * nothing while no skill is named Loner: an import creates it with the
 * positions that start with it, before any player.
 */
@Injectable()
export class JourneymanLonerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly slots: PaidAdvancementSlotsService,
  ) {}

  /**
   * Make sure the journeyman has his starting Loner: keep an active one,
   * otherwise convert his lowest-id gained Loner, otherwise revive a removed
   * starting one, otherwise insert one. The same rule the data migration
   * follows.
   */
  async ensureStartingLoner(playerId: number): Promise<void> {
    const lonerId = await this.lonerSkillId();
    if (lonerId === undefined) {
      return;
    }
    await this.db.transaction(async (tx) => {
      const rows = await this.lonerRows(tx, playerId, lonerId);
      if (rows.some((row) => !row.removed && row.source === 'starting')) {
        return;
      }
      const [gained] = rows
        .filter((row) => !row.removed && row.source !== 'starting')
        .sort((a, b) => a.id - b.id);
      if (gained !== undefined) {
        await tx
          .update(playerAdvancements)
          .set({
            source: 'starting',
            advancementOrder: null,
            orderConfirmed: false,
            isFreeExtra: false,
          })
          .where(eq(playerAdvancements.id, gained.id));
        await this.closeSlots(tx, { playerId, row: gained });
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
   * Retire a recruited journeyman's starting Loner: flag the player's active
   * starting Loner `removed`, unless his position starts with Loner (under
   * any rules set) or is a star-player position. One statement, so it is atomic and idempotent, and cheap
   * enough to run on every write of a player who is not a journeyman: a
   * retire a failed write left undone happens on the next one. A starting
   * row holds no number, so the recruit's numbering needs no change. A
   * gained Loner, free extra or not, is left alone: a source still listing
   * one on the recruit is recording a Loner he has for another reason.
   */
  async retireStartingLoner(playerId: number): Promise<void> {
    const positionLacksIt = sql`not exists (select 1 from ${positionRulesSetSkills} inner join ${positionRulesSets} on ${positionRulesSets.id} = ${positionRulesSetSkills.positionRulesSetId} inner join ${players} on ${players.positionId} = ${positionRulesSets.positionId} where ${players.id} = ${playerAdvancements.playerId} and ${positionRulesSetSkills.skillId} = ${playerAdvancements.skillId})`;
    // A journeyman is always a basic position, and a star or mercenary
    // position (Giant Mercenary, say) records no starting skills to check.
    const notStarPosition = sql`not exists (select 1 from ${players} inner join ${positions} on ${positions.id} = ${players.positionId} where ${players.id} = ${playerAdvancements.playerId} and ${eq(positions.isStarPlayer, true)})`;
    await this.db
      .update(playerAdvancements)
      .set({ removed: true })
      .where(
        and(
          eq(playerAdvancements.playerId, playerId),
          eq(playerAdvancements.source, 'starting'),
          eq(playerAdvancements.removed, false),
          eq(
            playerAdvancements.skillId,
            sql`(select ${skills.id} from ${skills} where ${eq(skills.name, LONER_SKILL_NAME)})`,
          ),
          positionLacksIt,
          notStarPosition,
        ),
      );
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
   * Close the number the converted gained row held: a confirmed paid row's
   * in the confirmed paid numbering, an unconfirmed row's (a free extra's
   * included) in the proxy numbering.
   */
  private async closeSlots(
    tx: DbOrTx,
    { playerId, row }: { playerId: number; row: LonerRow },
  ): Promise<void> {
    const order = row.advancementOrder;
    const numbered = order === null ? [] : [order];
    await this.slots.close(tx, {
      playerId,
      slots: row.orderConfirmed && !row.isFreeExtra ? numbered : [],
    });
    await this.slots.closeUnconfirmed(tx, {
      playerId,
      slots: row.orderConfirmed ? [] : numbered,
    });
  }
}
