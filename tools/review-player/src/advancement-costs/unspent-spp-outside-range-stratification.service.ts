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
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';

const OUTSIDE_RANGE_STRATUM = 'unspent-spp-outside-range';

/**
 * Every player whose source-reported unspent SPP lies outside the unspent
 * range modelled from their stored advancements and `advancement_costs`.
 * Holding unspent SPP is normal and never selects anyone; only a figure the
 * modelled range cannot contain does.
 *
 * Unlike the other strata this one reads the raw sources (BBL's Unspent SPP
 * row, TP's roster `starPlayerPoints`), through the same `source/` readers the
 * panels use. That is the only way to express "the source disagrees" as a
 * stratum. The readers cache per player, so the panels of a selected player
 * read nothing again.
 *
 * Deliberately ignores the caller's `limit`, like the SPP-discrepancy stratum:
 * a real disagreement must never be sampled away. Star players (they never
 * advance), players with no stored total, players whose rules set has no
 * costs and players with no source figure are never listed.
 */
@Injectable()
export class UnspentSppOutsideRangeStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: OUTSIDE_RANGE_STRATUM,
      label: 'Source unspent SPP outside the modelled range',
      sources: ['bbl', 'tp'],
    },
  ];

  constructor(
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly query: PlayerProjectionQueryService,
    private readonly history: PlayerAdvancementHistoryService,
    private readonly range: AdvancementCostRangeService,
    private readonly figures: SourceUnspentSppFigureService,
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
      if (figure === null || figure.unspent === null) {
        continue;
      }
      if (this.range.placement(figure.unspent, model.range) !== 'inside') {
        listed.push({ source, ...candidate });
      }
    }
    return listed;
  }
}
