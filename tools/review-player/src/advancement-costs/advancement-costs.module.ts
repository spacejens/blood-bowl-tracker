import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { AdvancementCostsDbRendererService } from './advancement-costs-db-renderer.service';
import { AdvancementCostsReviewerService } from './advancement-costs-reviewer.service';
import { BblAdvancementCostsRawRendererService } from './bbl-advancement-costs-raw-renderer.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { TpAdvancementCostsRawRendererService } from './tp-advancement-costs-raw-renderer.service';
import { UnspentSppOutsideRangeStratificationService } from './unspent-spp-outside-range-stratification.service';

/**
 * The advancement-costs data type: each source's own unspent SPP figure
 * beside each stored advancement's modelled cost, and the always-listed
 * stratum of players whose source figure lies outside the modelled range.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    AdvancementCostRangeService,
    AdvancementCostsDbRendererService,
    AdvancementCostsReviewerService,
    BblAdvancementCostsRawRendererService,
    PlayerAdvancementHistoryService,
    SourceUnspentSppFigureService,
    TpAdvancementCostsRawRendererService,
    UnspentSppOutsideRangeStratificationService,
  ],
  exports: [
    AdvancementCostsReviewerService,
    UnspentSppOutsideRangeStratificationService,
  ],
})
export class AdvancementCostsModule {}
