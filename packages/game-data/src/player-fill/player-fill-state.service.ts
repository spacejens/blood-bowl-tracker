import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  eraRulesSets,
  externalSystems,
  keywords,
  or,
  playerExternalIds,
  players,
  positionRulesSetKeywords,
  positionRulesSets,
  positions,
  teamEras,
} from '@blood-bowl-tracker/db';
import {
  BIG_GUY_KEYWORD_NAME,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import { INCOMPLETE_PLAYER_CRITERIA } from '../players/incomplete-player-criteria';
import type { PlayerFillState } from './player-fill.types';

/**
 * Reads what a manual fill checks about one stored player: his fill fields,
 * journeyman marker, position, era and stored lasting stat-reduction counts,
 * whether he is a star player, his TP external id, whether the shared
 * INCOMPLETE_PLAYER_CRITERIA still match him, his era's rules sets, whether
 * his position is a Big Guy under one of them, and his
 * active advancement rows in stored order
 * (PlayerAdvancementReadsService.listStoredAdvancements). Six small reads,
 * the last five skipped when the player does not exist.
 */
@Injectable()
export class PlayerFillStateService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reads: PlayerAdvancementReadsService,
  ) {}

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
        moveReductionCount: players.moveReductionCount,
        strengthReductionCount: players.strengthReductionCount,
        agilityReductionCount: players.agilityReductionCount,
        passingReductionCount: players.passingReductionCount,
        armourReductionCount: players.armourReductionCount,
        positionId: players.positionId,
        isStarPlayer: positions.isStarPlayer,
        isJourneyman: players.isJourneyman,
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
    const bigGuy = await this.db
      .select({ id: positionRulesSetKeywords.id })
      .from(positionRulesSetKeywords)
      .innerJoin(keywords, eq(keywords.id, positionRulesSetKeywords.keywordId))
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetKeywords.positionRulesSetId),
      )
      .innerJoin(
        eraRulesSets,
        eq(eraRulesSets.rulesSetId, positionRulesSets.rulesSetId),
      )
      .where(
        and(
          eq(positionRulesSets.positionId, player.positionId),
          eq(eraRulesSets.eraId, player.eraId),
          eq(keywords.name, BIG_GUY_KEYWORD_NAME),
        ),
      )
      .limit(1);
    const rows = await this.reads.listStoredAdvancements(playerId);
    return {
      playerId,
      isStarPlayer: player.isStarPlayer,
      isJourneyman: player.isJourneyman,
      isBigGuyPosition: bigGuy.length > 0,
      tpExternalId,
      positionId: player.positionId,
      eraId: player.eraId,
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
      reductions: {
        moveReductionCount: player.moveReductionCount,
        strengthReductionCount: player.strengthReductionCount,
        agilityReductionCount: player.agilityReductionCount,
        passingReductionCount: player.passingReductionCount,
        armourReductionCount: player.armourReductionCount,
      },
      rows,
      rulesSetIds: rulesSetRows.map((row) => row.rulesSetId),
    };
  }
}
