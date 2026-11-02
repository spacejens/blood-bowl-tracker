import type { Db } from '@blood-bowl-tracker/db';
import { and, asc, DB, eq, playerAdvancements } from '@blood-bowl-tracker/db';
import type {
  PlayerCharacteristic,
  PlayerSkillSource,
} from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

/** One characteristic increase a player has. */
export interface PlayerCharacteristicAdvancementRow {
  characteristic: PlayerCharacteristic;
  advancementOrder: number | null;
  orderConfirmed: boolean;
}

/** One stored advancement row of a player: a skill or a characteristic increase. */
export interface StoredPlayerAdvancement {
  skillId: number | null;
  attributeValue: string | null;
  characteristic: PlayerCharacteristic | null;
  source: PlayerSkillSource;
  advancementOrder: number | null;
  orderConfirmed: boolean;
  /** Gained without spending SPP; not one of the player's advancements. */
  isFreeExtra: boolean;
}

/**
 * Reads a player's advancement rows for consumers that need increases or the
 * raw stored order, which `PlayerSkillsService.listByPlayer` (skills only,
 * joined to their names) does not give. Removed rows are never returned.
 */
@Injectable()
export class PlayerAdvancementReadsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * The player's characteristic increases, by order with unknown ones last,
   * then in stat-line order.
   */
  async listCharacteristicAdvancements(
    playerId: number,
  ): Promise<PlayerCharacteristicAdvancementRow[]> {
    const rows = await this.db
      .select({
        characteristic: playerAdvancements.characteristic,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
      })
      .from(playerAdvancements)
      .where(
        and(
          eq(playerAdvancements.playerId, playerId),
          eq(playerAdvancements.source, 'characteristic'),
          eq(playerAdvancements.removed, false),
        ),
      )
      .orderBy(
        asc(playerAdvancements.advancementOrder),
        asc(playerAdvancements.characteristic),
        asc(playerAdvancements.id),
      );
    return rows.flatMap((row) =>
      row.characteristic === null
        ? []
        : [{ ...row, characteristic: row.characteristic }],
    );
  }

  /** Every active row of the player, skills and increases alike, in insertion order. */
  async listStoredAdvancements(
    playerId: number,
  ): Promise<StoredPlayerAdvancement[]> {
    return this.db
      .select({
        skillId: playerAdvancements.skillId,
        attributeValue: playerAdvancements.attributeValue,
        characteristic: playerAdvancements.characteristic,
        source: playerAdvancements.source,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
        isFreeExtra: playerAdvancements.isFreeExtra,
      })
      .from(playerAdvancements)
      .where(
        and(
          eq(playerAdvancements.playerId, playerId),
          eq(playerAdvancements.removed, false),
        ),
      )
      .orderBy(asc(playerAdvancements.id));
  }
}
