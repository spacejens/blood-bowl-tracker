import type {
  CharacteristicFormat,
  PositionRulesSetCharacteristics,
  RulesSet,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { ImportResultService } from './import-result.service';
import { PositionRulesSetsImportService } from './position-rules-sets-import.service';
import type { ImportError } from './types';

/** One player's own current characteristics, as the importer computed them. */
export interface PlayerCurrentCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/** The five reduction counters the same importer already derived. */
export interface PlayerCharacteristicReductionCounts {
  moveReductionCount: number;
  strengthReductionCount: number;
  agilityReductionCount: number;
  passingReductionCount: number;
  armourReductionCount: number;
}

/** The five counters this service produces, ready to spread into an upsert. */
export interface PlayerCharacteristicIncreaseCounts {
  moveIncreaseCount: number;
  strengthIncreaseCount: number;
  agilityIncreaseCount: number;
  passingIncreaseCount: number;
  armourIncreaseCount: number;
}

/** One characteristic, paired with the two counters it maps to. */
interface Comparison {
  key: keyof PlayerCurrentCharacteristics;
  increase: keyof PlayerCharacteristicIncreaseCounts;
  reduction: keyof PlayerCharacteristicReductionCounts;
  format: CharacteristicFormat;
  /**
   * Whether a LOWER stored number is the better one. True only for Agility
   * and Passing under a roll-target format: those are targets the PLAYER
   * rolls, so a smaller target is easier to make. Armour under the same
   * format is the opposite -- it is a target the OPPONENT rolls to hurt the
   * player -- and every characteristic under `bare` is a plain "more is
   * better" number. The same reading `TpLastingInjuryBuilderService` applies
   * in the opposite direction.
   */
  lowerIsBetter: boolean;
}

const ZERO_REDUCTIONS: PlayerCharacteristicReductionCounts = {
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

/**
 * Derives how many times each of a player's five characteristics has been
 * increased by advancement.
 *
 * Neither source records advancements as events. What both DO expose is the
 * player's current characteristics, and what the position they hold starts
 * with under their own rules set is already stored in `position_rules_sets` --
 * read back over the API rather than held as a second, hand-duplicated copy,
 * the same thing `TpMercenaryCharacteristicsService` does with the same call.
 *
 * For each characteristic:
 *
 *   increaseCount = max(0, gap + reductionCount)
 *
 * where `gap` is how far the current value sits on the BETTER side of the
 * baseline. Adding the outstanding reduction count back is what keeps an
 * increase visible on a characteristic that a lasting injury has since pushed
 * back down: the two cancel in the raw value but not in the tally. The clamp
 * at 0 covers the opposite case -- a value on the worse side of the baseline
 * with no reduction recorded for it is a data gap, not a negative advancement.
 *
 * The whole group is all-or-nothing: `PlayerCharacteristicIncreaseValidationService`
 * rejects a partial line, so every path here either returns all five counts or
 * `undefined` (send none). A rules set with no Passing characteristic still
 * sends `passingIncreaseCount: 0` for that reason.
 */
@Injectable()
export class PlayerCharacteristicIncreasesService {
  /**
   * Position id -> its stored baselines by rules set id, or `undefined` when
   * the read itself failed. One read per position per import run.
   */
  private readonly baselinesByPositionId = new Map<
    number,
    Map<number, PositionRulesSetCharacteristics> | undefined
  >();

  /** `${positionId}|${rulesSetId}` pairs already reported as uncovered. */
  private readonly reportedGaps = new Set<string>();

  constructor(
    private readonly positionRulesSetsImport: PositionRulesSetsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * The five counts for one player, or `undefined` when no baseline covers
   * their (position, rules set) pair -- an error condition, since the
   * positions step always runs before players. A failed read adds no error of
   * its own: `listPositionRulesSets` already recorded one, and piling a second
   * on top would be misleading.
   */
  async forPlayer(options: {
    player: { label: string; positionId: number };
    rulesSet: RulesSet;
    current: PlayerCurrentCharacteristics;
    reductions: PlayerCharacteristicReductionCounts | undefined;
    errors: ImportError[];
  }): Promise<PlayerCharacteristicIncreaseCounts | undefined> {
    const { player, rulesSet, current, reductions, errors } = options;
    const baselines = await this.baselines(player.positionId, errors);
    if (baselines === undefined) {
      return undefined;
    }
    const baseline = baselines.get(rulesSet.id);
    if (baseline === undefined) {
      const key = `${player.positionId}|${rulesSet.id}`;
      if (!this.reportedGaps.has(key)) {
        this.reportedGaps.add(key);
        errors.push(
          this.importResults.error({
            item: { position: player.positionId, rulesSet: rulesSet.id },
            message:
              `Imported ${player.label} without characteristic-increase ` +
              `counts: position ${player.positionId} has no stored ` +
              `characteristics under rules set "${rulesSet.name}", so there ` +
              'is no baseline to measure their advancements against.',
          }),
        );
      }
      return undefined;
    }

    const applied = reductions ?? ZERO_REDUCTIONS;
    const counts: PlayerCharacteristicIncreaseCounts = {
      moveIncreaseCount: 0,
      strengthIncreaseCount: 0,
      agilityIncreaseCount: 0,
      passingIncreaseCount: 0,
      armourIncreaseCount: 0,
    };
    for (const comparison of this.comparisons(rulesSet)) {
      const currentValue = current[comparison.key];
      const baselineValue = baseline[comparison.key];
      if (
        comparison.format === 'absent' ||
        currentValue === null ||
        baselineValue === null
      ) {
        // A rules set with no such characteristic has nothing to advance, but
        // the group is all-or-nothing, so the count is sent as an explicit 0.
        continue;
      }
      const gap = comparison.lowerIsBetter
        ? baselineValue - currentValue
        : currentValue - baselineValue;
      counts[comparison.increase] = Math.max(
        0,
        gap + applied[comparison.reduction],
      );
    }
    return counts;
  }

  /** One position's stored baselines, read at most once per import run. */
  private async baselines(
    positionId: number,
    errors: ImportError[],
  ): Promise<Map<number, PositionRulesSetCharacteristics> | undefined> {
    if (this.baselinesByPositionId.has(positionId)) {
      return this.baselinesByPositionId.get(positionId);
    }
    const rows = await this.positionRulesSetsImport.listPositionRulesSets(
      positionId,
      errors,
    );
    const baselines =
      rows === undefined
        ? undefined
        : new Map(rows.map((row) => [row.rulesSetId, row]));
    this.baselinesByPositionId.set(positionId, baselines);
    return baselines;
  }

  /** The five characteristics, each with this rules set's reading of it. */
  private comparisons(rulesSet: RulesSet): Comparison[] {
    const rollTarget = (format: CharacteristicFormat): boolean =>
      format === 'plus' || format === 'plus_zero_legal';
    return [
      {
        key: 'move',
        increase: 'moveIncreaseCount',
        reduction: 'moveReductionCount',
        format: rulesSet.moveFormat,
        lowerIsBetter: false,
      },
      {
        key: 'strength',
        increase: 'strengthIncreaseCount',
        reduction: 'strengthReductionCount',
        format: rulesSet.strengthFormat,
        lowerIsBetter: false,
      },
      {
        key: 'agility',
        increase: 'agilityIncreaseCount',
        reduction: 'agilityReductionCount',
        format: rulesSet.agilityFormat,
        lowerIsBetter: rollTarget(rulesSet.agilityFormat),
      },
      {
        key: 'passing',
        increase: 'passingIncreaseCount',
        reduction: 'passingReductionCount',
        format: rulesSet.passingFormat,
        lowerIsBetter: rollTarget(rulesSet.passingFormat),
      },
      {
        key: 'armour',
        increase: 'armourIncreaseCount',
        reduction: 'armourReductionCount',
        format: rulesSet.armourFormat,
        lowerIsBetter: false,
      },
    ];
  }
}
