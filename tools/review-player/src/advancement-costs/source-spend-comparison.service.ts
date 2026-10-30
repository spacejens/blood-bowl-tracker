import { Injectable } from '@nestjs/common';

import type {
  FigurePlacement,
  ModelledRange,
  SpendComparison,
  UnspentSppModel,
} from './advancement-cost-model.types';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';

/**
 * Places the spend a source itself reports, its total minus its unspent SPP
 * from the same page or snapshot, against the modelled spend range. Spend is
 * compared rather than unspent SPP because the stored total need not be the
 * total the source's unspent figure was taken from. One place for both the
 * imported panel and the stratum, so they can never disagree.
 */
@Injectable()
export class SourceSpendComparisonService {
  compare(
    model: UnspentSppModel,
    figure: SourceUnspentSppFigure | null,
  ): SpendComparison {
    if (
      model.range === null ||
      figure === null ||
      figure.reportedTotal === null ||
      figure.unspent === null
    ) {
      return { kind: 'none' };
    }
    const reportedSpend = figure.reportedTotal - figure.unspent;
    if (this.isBblFigureUnderFixedThresholds(model, figure)) {
      return { kind: 'not_compared', reportedSpend };
    }
    return {
      kind: 'compared',
      reportedSpend,
      placement: this.placement(reportedSpend, model.range),
    };
  }

  /**
   * BBL prices every player's spend at BB2020 costs and recalculates older
   * totals at BB2020 rates, so under a fixed-threshold rules set (CRP, CRP+,
   * BB2016) its figure is not comparable with the modelled spend and is not
   * placed against it. TP figures are compared under every rules set.
   */
  private isBblFigureUnderFixedThresholds(
    model: UnspentSppModel,
    figure: SourceUnspentSppFigure,
  ): boolean {
    return figure.source === 'bbl' && model.fixedThresholds;
  }

  private placement(spend: number, range: ModelledRange): FigurePlacement {
    if (spend < range.spentMin) {
      return 'below';
    }
    return spend > range.spentMax ? 'above' : 'inside';
  }
}
