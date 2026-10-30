import { Injectable } from '@nestjs/common';

import type {
  FigurePlacement,
  StoredSourceComparison,
  StoredUnspentCheck,
  UnspentSppModel,
} from './advancement-cost-model.types';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';

/**
 * Checks the unspent SPP the importer stored against the modelled unspent
 * range and against the source's own unspent figure. A kind-priced value is
 * the source's figure, so it should match it and may lie outside the range
 * where the recorded history is incomplete; a fixed-threshold value is
 * computed, so it should lie inside the range. One place for both the
 * imported panel and the stratum, so they can never disagree.
 */
@Injectable()
export class StoredUnspentSppCheckService {
  constructor(private readonly spendComparison: SourceSpendComparisonService) {}

  check(
    model: UnspentSppModel,
    stored: number | null,
    figure: SourceUnspentSppFigure | null,
  ): StoredUnspentCheck {
    if (stored === null) {
      return { kind: 'none_stored' };
    }
    return {
      kind: 'stored',
      stored,
      placement: this.placement(model, stored),
      source: this.sourceComparison(model, stored, figure),
      sourceUnspent: figure?.unspent ?? null,
    };
  }

  /** True when the stored figure lies outside the range or differs from the source. */
  disagrees(check: StoredUnspentCheck): boolean {
    return (
      check.kind === 'stored' &&
      (check.placement === 'below' ||
        check.placement === 'above' ||
        check.source === 'differs')
    );
  }

  private placement(
    model: UnspentSppModel,
    stored: number,
  ): FigurePlacement | null {
    if (model.range === null) {
      return null;
    }
    if (stored < model.range.unspentMin) {
      return 'below';
    }
    return stored > model.range.unspentMax ? 'above' : 'inside';
  }

  private sourceComparison(
    model: UnspentSppModel,
    stored: number,
    figure: SourceUnspentSppFigure | null,
  ): StoredSourceComparison {
    if (figure === null || figure.unspent === null) {
      return 'no_figure';
    }
    if (this.spendComparison.isBblFigureUnderFixedThresholds(model, figure)) {
      return 'not_compared';
    }
    return stored === figure.unspent ? 'matches' : 'differs';
  }
}
