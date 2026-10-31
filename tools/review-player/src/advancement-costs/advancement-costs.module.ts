import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { AdvancementCostsDbRendererService } from './advancement-costs-db-renderer.service';
import { AdvancementCostsReviewerService } from './advancement-costs-reviewer.service';
import { BblAdvancementCostsRawRendererService } from './bbl-advancement-costs-raw-renderer.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { StoredUnspentSppCheckService } from './stored-unspent-spp-check.service';
import { TpAdvancementCostsRawRendererService } from './tp-advancement-costs-raw-renderer.service';
import { UnspentSppOutsideRangeStratificationService } from './unspent-spp-outside-range-stratification.service';

/**
 * The advancement-costs data type: each source's own SPP figures beside each
 * stored advancement's modelled cost, and the always-listed stratum of
 * players whose source-reported spend, or stored unspent SPP, disagrees with
 * the modelled range or the source.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    AdvancementCostRangeService,
    AdvancementCostsDbRendererService,
    AdvancementCostsReviewerService,
    BblAdvancementCostsRawRendererService,
    PlayerAdvancementHistoryService,
    SourceSpendComparisonService,
    SourceUnspentSppFigureService,
    StoredUnspentSppCheckService,
    TpAdvancementCostsRawRendererService,
    UnspentSppOutsideRangeStratificationService,
  ],
  exports: [
    AdvancementCostsReviewerService,
    UnspentSppOutsideRangeStratificationService,
  ],
})
export class AdvancementCostsModule {}
