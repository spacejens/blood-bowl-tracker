import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  eraRulesSets,
  externalSystems,
  or,
  playerAdvancements,
  playerExternalIds,
  players,
  positions,
  teamEras,
} from '@blood-bowl-tracker/db';
import { TP_EXTERNAL_SYSTEM_NAME } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { INCOMPLETE_PLAYER_CRITERIA } from '../players/incomplete-player-criteria';
import type { PlayerFillState } from './player-fill.types';

/**
 * Reads what a manual fill checks about one stored player: his fill fields,
 * whether he is a star player, his TP external id, whether the shared
 * INCOMPLETE_PLAYER_CRITERIA still match him, his era's rules sets and his
 * active advancement rows. Five small queries, the last four skipped when
 * the player does not exist.
 */
@Injectable()
export class PlayerFillStateService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async load(playerId: number): Promise<PlayerFillState | undefined> {
    const [player] = await this.db
      .select({
        move: players.move,
        strength: players.strength,
        agility: players.agility,
        passing: players.passing,
        armour: players.armour,
        sppTotal: players.sppTotal,
        sppAdjustment: players.sppAdjustment,
        unspentSpp: players.unspentSpp,
        status: players.status,
        isStarPlayer: positions.isStarPlayer,
        eraId: teamEras.eraId,
      })
      .from(players)
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .where(eq(players.id, playerId));
    if (player === undefined) {
      return undefined;
    }
    const [tpExternalId] = await this.db
      .select({
        externalSystemId: playerExternalIds.externalSystemId,
        externalId: playerExternalIds.externalId,
      })
      .from(playerExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, playerExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(playerExternalIds.playerId, playerId),
          eq(externalSystems.name, TP_EXTERNAL_SYSTEM_NAME),
        ),
      )
      .limit(1);
    const incomplete = await this.db
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.id, playerId), or(...INCOMPLETE_PLAYER_CRITERIA)));
    const rulesSetRows = await this.db
      .select({ rulesSetId: eraRulesSets.rulesSetId })
      .from(eraRulesSets)
      .where(eq(eraRulesSets.eraId, player.eraId));
    const rows = await this.db
      .select({
        skillId: playerAdvancements.skillId,
        characteristic: playerAdvancements.characteristic,
        attributeValue: playerAdvancements.attributeValue,
        source: playerAdvancements.source,
        isFreeExtra: playerAdvancements.isFreeExtra,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
      })
      .from(playerAdvancements)
      .where(
        and(
          eq(playerAdvancements.playerId, playerId),
          eq(playerAdvancements.removed, false),
        ),
      );
    return {
      playerId,
      isStarPlayer: player.isStarPlayer,
      tpExternalId,
      incomplete: incomplete.length > 0,
      fields: {
        move: player.move,
        strength: player.strength,
        agility: player.agility,
        passing: player.passing,
        armour: player.armour,
        sppTotal: player.sppTotal,
        sppAdjustment: player.sppAdjustment,
        unspentSpp: player.unspentSpp,
        status: player.status,
      },
      rows,
      rulesSetIds: rulesSetRows.map((row) => row.rulesSetId),
    };
  }
}
