import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  eq,
  inArray,
  playerAdvancements,
  skills,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import type {
  PlayerCharacteristic,
  PlayerSkillSource,
} from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import {
  FREE_EXTRA_SKILL_NAMES,
  PlayerAdvancementSyncPlannerService,
} from './player-advancement-sync-planner.service';

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
 * Also tells a caller which of its entries `PlayerSkillsService.sync` will
 * store as free extras, before it writes them.
 */
@Injectable()
export class PlayerAdvancementReadsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly syncPlanner: PlayerAdvancementSyncPlannerService,
  ) {}

  /**
   * The entries with `isFreeExtra: true` set on each gained skill that
   * `PlayerSkillsService.sync` stores as a free extra although the source
   * did not flag it: by the same rule (PlayerAdvancementSyncPlannerService's
   * `isFreeExtra`), a Hatred or Loner or a skill one of the player's own trophy
   * awards grants. Starting skills and increases are returned as given.
   * Two small queries, both skipped when no gained skill is left unflagged.
   */
  async resolveFreeExtras(
    entries: PlayerSkillEntry[],
  ): Promise<PlayerSkillEntry[]> {
    const unflagged = entries.flatMap((entry) =>
      entry.skillId === undefined ||
      entry.source === 'starting' ||
      entry.isFreeExtra === true
        ? []
        : [{ entry, skillId: entry.skillId }],
    );
    if (unflagged.length === 0) {
      return entries;
    }
    const skillIds = [...new Set(unflagged.map(({ skillId }) => skillId))];
    const playerIds = [
      ...new Set(unflagged.map(({ entry }) => entry.playerId)),
    ];
    const nameRuleRows = await this.db
      .select({ id: skills.id })
      .from(skills)
      .where(
        and(
          inArray(skills.id, skillIds),
          inArray(skills.name, [...FREE_EXTRA_SKILL_NAMES]),
        ),
      );
    const awards = await this.db
      .select({
        playerId: trophyAwards.playerId,
        grantedSkillId: trophyAwards.grantedSkillId,
      })
      .from(trophyAwards)
      .where(
        and(
          inArray(trophyAwards.playerId, playerIds),
          inArray(trophyAwards.grantedSkillId, skillIds),
        ),
      );
    const facts = {
      freeExtraSkillIds: new Set(nameRuleRows.map((row) => row.id)),
      grantedSkillIdsByPlayer: this.syncPlanner.grantedSkillIdsByPlayer(awards),
    };
    const free = new Set(
      unflagged
        .filter(({ entry, skillId }) =>
          this.syncPlanner.isFreeExtra(entry, skillId, facts),
        )
        .map(({ entry }) => entry),
    );
    return entries.map((entry) =>
      free.has(entry) ? { ...entry, isFreeExtra: true } : entry,
    );
  }

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
