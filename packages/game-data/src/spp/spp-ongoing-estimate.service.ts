import type { SppCareerCounts } from '@blood-bowl-tracker/api-contract';
import { SPP_CAREER_COUNT_KEYS } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { SppAwardValuesService } from './spp-award-values.service';
import { SppEventCountsService } from './spp-event-counts.service';

/**
 * One player's ongoing-SPP input: their id and, if the source reported them,
 * their career-wide per-group action counts.
 */
export interface OngoingSppEntry {
  playerId: number;
  careerCounts?: SppCareerCounts;
}

/**
 * Estimates how much Star Player Points a player has earned in events that
 * exist on the source but have NOT been imported here — in practice, events in
 * a competition that is still in progress and has not been downloaded yet.
 *
 * The shortfall per group (career count minus imported count) is priced with
 * the standardised award table via
 * {@link SppAwardValuesService.resolveSppValue}. That table is normally
 * irrelevant to TP-sourced events, which carry TP's own per-event figure
 * verbatim; it is repurposed here precisely BECAUSE these events have no
 * per-event figure to carry — they have not been imported at all. The result is
 * an estimate, deliberately: the interception group covers deflections and the
 * casualty group covers every severity, each priced at one representative
 * value, so a small residual imprecision is expected and accepted (see the
 * design doc's "Known limitations").
 *
 * A negative shortfall is clamped to 0: more imported than the source claims is
 * an inconsistency, never a reason to subtract SPP from the estimate. A group
 * the award table cannot price counts as worth 0 rather than being guessed at.
 */
@Injectable()
export class SppOngoingEstimateService {
  constructor(
    private readonly eventCounts: SppEventCountsService,
    private readonly awardValues: SppAwardValuesService,
  ) {}

  /**
   * Estimated ongoing SPP per player, keyed by player id. Players with no
   * career counts are absent from the map entirely — "no evidence", which the
   * caller treats as no estimate rather than an estimate of zero.
   */
  async estimateForPlayers(
    entries: OngoingSppEntry[],
  ): Promise<Map<number, number>> {
    const estimates = new Map<number, number>();
    const ids = entries
      .filter((entry) => entry.careerCounts !== undefined)
      .map((entry) => entry.playerId);
    if (ids.length === 0) {
      return estimates;
    }

    const imported = await this.eventCounts.importedCountsForPlayers(ids);
    for (const entry of entries) {
      const career = entry.careerCounts;
      if (career === undefined) {
        continue;
      }
      const importedCounts =
        imported.get(entry.playerId) ?? this.eventCounts.emptyCounts();
      let estimate = 0;
      for (const group of SPP_CAREER_COUNT_KEYS) {
        const ongoing = Math.max(0, career[group] - importedCounts[group]);
        if (ongoing === 0) {
          continue;
        }
        const value = await this.awardValues.resolveSppValue({
          actingPlayerId: entry.playerId,
          actionType: group,
        });
        estimate += ongoing * (value ?? 0);
      }
      estimates.set(entry.playerId, estimate);
    }
    return estimates;
  }
}
