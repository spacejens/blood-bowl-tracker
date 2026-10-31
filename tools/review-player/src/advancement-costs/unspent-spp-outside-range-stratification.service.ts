import {
  and,
  asc,
  eq,
  isNotNull,
  players,
  positions,
} from '@blood-bowl-tracker/db';
import { ExternalSystemLookupService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { StoredUnspentSppCheckService } from './stored-unspent-spp-check.service';

const OUTSIDE_RANGE_STRATUM = 'unspent-spp-outside-range';

/**
 * Every player whose source-reported spend (the source's total minus its
 * unspent SPP) lies outside the spend range modelled from their stored
 * advancements and `advancement_costs`. Holding unspent SPP is normal and
 * never selects anyone; only a spend the modelled range cannot contain does.
 * The comparison itself, including which figures are not compared, is
 * `SourceSpendComparisonService`'s, shared with the imported panel.
 * It also lists every player whose stored unspent SPP lies outside the
 * modelled unspent range or differs from the source's own unspent figure
 * (never compared for BBL under fixed thresholds).
 *
 * Unlike the other strata this one reads the raw sources (BBL's Unspent SPP
 * row and bracketed total, TP's roster `starPlayerPoints` and
 * `totalStarPlayerPoints`), through the same `source/` readers the panels
 * use. That is the only way to express "the source disagrees" as a stratum.
 *
 * Deliberately ignores the caller's `limit`, like the SPP-discrepancy stratum:
 * a real disagreement must never be sampled away. Star players (they never
 * advance), players with no stored total and players whose rules set has no
 * costs are never listed. A player with no complete source figure has no
 * source spend to compare, so only a stored unspent SPP outside the modelled
 * range lists them.
 */
@Injectable()
export class UnspentSppOutsideRangeStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: OUTSIDE_RANGE_STRATUM,
      label: 'Unspent SPP disagreeing with the modelled range or the source',
      sources: ['bbl', 'tp'],
    },
  ];

  constructor(
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly query: PlayerProjectionQueryService,
    private readonly history: PlayerAdvancementHistoryService,
    private readonly range: AdvancementCostRangeService,
    private readonly figures: SourceUnspentSppFigureService,
    private readonly comparison: SourceSpendComparisonService,
    private readonly storedCheck: StoredUnspentSppCheckService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
  }: StratumSampleRequest): Promise<ReviewPlayer[]> {
    if (stratumId !== OUTSIDE_RANGE_STRATUM) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${OUTSIDE_RANGE_STRATUM}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const candidates = await this.query
      .base(externalSystemId)
      .where(
        and(eq(positions.isStarPlayer, false), isNotNull(players.sppTotal)),
      )
      .orderBy(asc(players.name), asc(players.id));
    const histories = await this.history.forPlayers(
      candidates.map((candidate) => candidate.playerId),
    );
    const listed: ReviewPlayer[] = [];
    for (const candidate of candidates) {
      const history = histories.get(candidate.playerId);
      if (history === undefined) {
        continue;
      }
      const model = this.range.model(history);
      if (model.range === null) {
        continue;
      }
      const figure = await this.figures.figureFor({
        source,
        externalId: candidate.externalId,
      });
      const compared = this.comparison.compare(model, figure);
      const stored = this.storedCheck.check(
        model,
        history.storedUnspentSpp,
        figure,
      );
      if (
        (compared.kind === 'compared' && compared.placement !== 'inside') ||
        this.storedCheck.disagrees(stored)
      ) {
        listed.push({ source, ...candidate });
      }
    }
    return listed;
  }
}
