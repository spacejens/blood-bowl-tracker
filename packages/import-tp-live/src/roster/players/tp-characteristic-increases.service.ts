import type {
  CharacteristicFormat,
  ImportError,
  RulesSet,
} from '@blood-bowl-tracker/api-contract';
import type { PositionCharacteristics } from '@blood-bowl-tracker/game-data';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';

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

/** Per-import memo of baseline reads and already-reported gaps. */
export interface IncreaseBaselineCache {
  baselinesByPositionId: Map<
    number,
    Map<number, PositionCharacteristics> | undefined
  >;
  reportedGaps: Set<string>;
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
 * Server-side implementation of the characteristic-increase arithmetic, for
 * this package's TP roster import, which cannot depend on the RPC-client
 * `packages/import`. Reads its fallback baseline straight from the database
 * and keeps no state between imports (see `newCache`).
 *
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
export class TpCharacteristicIncreasesService {
  constructor(
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * A fresh per-import cache. One import reads each position's baseline at
   * most once; nothing carries over to the next import, which matters in
   * the long-lived processes this runs in.
   */
  newCache(): IncreaseBaselineCache {
    return { baselinesByPositionId: new Map(), reportedGaps: new Set() };
  }

  /**
   * The five counts for one player, or `undefined` when no baseline covers
   * their (position, rules set) pair -- an error condition, since the
   * positions step always runs before players. A failed read adds no error of
   * its own: the baseline read already recorded one, and piling a second on
   * top would be misleading.
   *
   * `baseline`, when supplied, is used INSTEAD of the internal
   * `positionRulesSets.listByPosition` DB read -- for a caller (TP) that
   * already has a per-player baseline embedded in its own source data and
   * needs its increase counts measured against exactly that baseline, the
   * same one its reduction-count computation already uses, rather than a
   * separate DB read that could disagree with it. A caller with no such
   * embedded baseline (BBL) simply omits it and keeps using the DB-read path
   * below.
   */
  async forPlayer(options: {
    player: { label: string; positionId: number };
    rulesSet: RulesSet;
    current: PlayerCurrentCharacteristics;
    reductions: PlayerCharacteristicReductionCounts | undefined;
    baseline: PlayerCurrentCharacteristics | undefined;
    cache: IncreaseBaselineCache;
    errors: ImportError[];
  }): Promise<PlayerCharacteristicIncreaseCounts | undefined> {
    const { player, rulesSet, current, reductions, cache, errors } = options;
    let baseline: PlayerCurrentCharacteristics;
    if (options.baseline !== undefined) {
      baseline = options.baseline;
    } else {
      const baselines = await this.baselines({
        positionId: player.positionId,
        cache,
        errors,
      });
      if (baselines === undefined) {
        return undefined;
      }
      const stored = baselines.get(rulesSet.id);
      if (stored === undefined) {
        const key = `${player.positionId}|${rulesSet.id}`;
        if (!cache.reportedGaps.has(key)) {
          cache.reportedGaps.add(key);
          errors.push(
            this.importResults.error({
              item: { position: player.positionId, rulesSet: rulesSet.id },
              message:
                `Imported ${player.label} without characteristic-increase ` +
                `counts: position ${player.positionId} has no stored ` +
                `characteristics under rules set "${rulesSet.name}", so ` +
                'there is no baseline to measure their advancements against.',
            }),
          );
        }
        return undefined;
      }
      baseline = stored;
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

  /** One position's stored baselines, read at most once per cache. */
  private async baselines(options: {
    positionId: number;
    cache: IncreaseBaselineCache;
    errors: ImportError[];
  }): Promise<Map<number, PositionCharacteristics> | undefined> {
    const { positionId, cache, errors } = options;
    if (cache.baselinesByPositionId.has(positionId)) {
      return cache.baselinesByPositionId.get(positionId);
    }
    const rows = await this.runner.record({
      run: () => this.positionRulesSets.listByPosition(positionId),
      item: { positionRulesSets: positionId },
      errors,
      buildErrorMessage: (error) =>
        `Failed to list characteristics for position ${positionId}: ${this.runner.messageOf(error)}`,
    });
    const baselines =
      rows === undefined
        ? undefined
        : new Map(rows.map((row) => [row.rulesSetId, row]));
    cache.baselinesByPositionId.set(positionId, baselines);
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
