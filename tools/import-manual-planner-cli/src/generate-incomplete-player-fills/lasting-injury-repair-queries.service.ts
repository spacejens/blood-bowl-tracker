import type { DbOrTx } from '@blood-bowl-tracker/db';
import {
  and,
  desc,
  eq,
  eraRulesSets,
  externalSystems,
  inArray,
  isNotNull,
  matchEvents,
  not,
  playerAdvancements,
  playerExternalIds,
  players,
  positionRulesSets,
  positions,
  rulesSets,
  sql,
  teamEras,
} from '@blood-bowl-tracker/db';
import type { PlayerCharacteristic } from '@blood-bowl-tracker/domain-enums';
import { TP_EXTERNAL_SYSTEM_NAME } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import { CHARACTERISTIC_KEY_BY_NAME } from './characteristic-keys';
import type {
  LastingInjuryRepairCandidate,
  RepairRulesSetContext,
} from './fill-plan.types';
import type { FormatColumns, LineColumns } from './fill-query.types';
import {
  INCOMPLETE_PLAYER,
  STAT_REDUCTION_TYPES,
  TP_NON_STAR_PLAYER,
} from './fill-query-conditions';
import { FillRowShapesService } from './fill-row-shapes.service';

interface RepairPlayer extends LineColumns {
  playerId: number;
  tpId: string;
  positionId: number;
  eraId: number;
}

interface EraRulesSet extends FormatColumns {
  eraRulesSetId: number;
  eraId: number;
  rulesSetId: number;
}

interface PositionLine extends LineColumns {
  positionId: number;
  rulesSetId: number;
}

/** The players found, and their eras' rules sets: what the start-line read is scoped by. */
interface RepairScope {
  found: readonly RepairPlayer[];
  eraRules: readonly EraRulesSet[];
}

/** Everything known about the players' eras' rules sets. */
interface KnownRules {
  eraRules: readonly EraRulesSet[];
  lines: readonly PositionLine[];
}

/**
 * The `lastingInjuryRepairs` candidates: every non-star TP player no longer
 * incomplete, with a stat-reduction match event recorded and no lasting
 * reduction stored, named by one TP id (the first in text order), with what
 * the server derives his reductions from: his stored line, his active
 * characteristic increases, and the rules set context
 * PositionRulesSetsService.findCharacteristicsContext resolves for his
 * position and his team era's era. LastingInjuryRepairSelectorService keeps
 * those the server would record a reduction for. The context resolution
 * must track findCharacteristicsContext in packages/game-data.
 */
@Injectable()
export class LastingInjuryRepairQueriesService {
  constructor(private readonly shapes: FillRowShapesService) {}

  async candidates(tx: DbOrTx): Promise<LastingInjuryRepairCandidate[]> {
    const found = await this.players(tx);
    const increases = await tx
      .select({
        playerId: playerAdvancements.playerId,
        // Never null: the filter keeps only characteristic rows.
        characteristic: sql<PlayerCharacteristic>`${playerAdvancements.characteristic}`,
      })
      .from(playerAdvancements)
      .where(
        and(
          inArray(
            playerAdvancements.playerId,
            found.map((player) => player.playerId),
          ),
          eq(playerAdvancements.removed, false),
          eq(playerAdvancements.source, 'characteristic'),
          isNotNull(playerAdvancements.characteristic),
        ),
      )
      .orderBy(playerAdvancements.id);
    const eraRules = await this.eraRules(tx, found);
    const lines = await this.positionLines(tx, { found, eraRules });
    return found.map((player) => ({
      player: { system: TP_EXTERNAL_SYSTEM_NAME, id: player.tpId },
      line: this.shapes.line(player),
      increases: increases
        .filter((increase) => increase.playerId === player.playerId)
        .map((increase) => CHARACTERISTIC_KEY_BY_NAME[increase.characteristic]),
      context: this.context(player, { eraRules, lines }),
    }));
  }

  private async players(tx: DbOrTx): Promise<RepairPlayer[]> {
    return tx
      .selectDistinctOn([players.id], {
        playerId: players.id,
        tpId: playerExternalIds.externalId,
        positionId: players.positionId,
        eraId: teamEras.eraId,
        move: players.move,
        strength: players.strength,
        agility: players.agility,
        passing: players.passing,
        armour: players.armour,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(playerExternalIds, eq(playerExternalIds.playerId, players.id))
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, playerExternalIds.externalSystemId),
      )
      .innerJoin(matchEvents, eq(matchEvents.consequencePlayerId, players.id))
      .where(
        and(
          TP_NON_STAR_PLAYER,
          not(INCOMPLETE_PLAYER),
          eq(players.moveReductionCount, 0),
          eq(players.strengthReductionCount, 0),
          eq(players.agilityReductionCount, 0),
          eq(players.passingReductionCount, 0),
          eq(players.armourReductionCount, 0),
          inArray(matchEvents.consequenceType, STAT_REDUCTION_TYPES),
        ),
      )
      .orderBy(players.id, playerExternalIds.externalId);
  }

  /** The rules sets of the players' eras, last-listed first. */
  private async eraRules(
    tx: DbOrTx,
    found: readonly RepairPlayer[],
  ): Promise<EraRulesSet[]> {
    return tx
      .select({
        eraRulesSetId: eraRulesSets.id,
        eraId: eraRulesSets.eraId,
        rulesSetId: eraRulesSets.rulesSetId,
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .where(
        inArray(eraRulesSets.eraId, [
          ...new Set(found.map((player) => player.eraId)),
        ]),
      )
      .orderBy(desc(eraRulesSets.id));
  }

  /** The start lines of the players' positions under those rules sets. */
  private async positionLines(
    tx: DbOrTx,
    scope: RepairScope,
  ): Promise<PositionLine[]> {
    return tx
      .select({
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
        move: positionRulesSets.move,
        strength: positionRulesSets.strength,
        agility: positionRulesSets.agility,
        passing: positionRulesSets.passing,
        armour: positionRulesSets.armour,
      })
      .from(positionRulesSets)
      .where(
        and(
          inArray(positionRulesSets.positionId, [
            ...new Set(scope.found.map((player) => player.positionId)),
          ]),
          inArray(positionRulesSets.rulesSetId, [
            ...new Set(scope.eraRules.map((rules) => rules.rulesSetId)),
          ]),
        ),
      );
  }

  /**
   * The last-listed era rules set with a row for his position, else the
   * last-listed one with no start line; null when the era lists none.
   */
  private context(
    player: RepairPlayer,
    known: KnownRules,
  ): RepairRulesSetContext | null {
    const lineFor = (rules: EraRulesSet): PositionLine | undefined =>
      known.lines.find(
        (line) =>
          line.rulesSetId === rules.rulesSetId &&
          line.positionId === player.positionId,
      );
    const ofEra = known.eraRules.filter(
      (rules) => rules.eraId === player.eraId,
    );
    const chosen =
      ofEra.find((rules) => lineFor(rules) !== undefined) ?? ofEra.at(0);
    if (chosen === undefined) {
      return null;
    }
    const baseline = lineFor(chosen);
    return {
      formats: this.shapes.formats(chosen),
      baseline: baseline === undefined ? null : this.shapes.line(baseline),
    };
  }
}
