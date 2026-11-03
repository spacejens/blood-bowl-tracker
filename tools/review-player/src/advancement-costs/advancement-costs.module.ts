import { Module } from '@nestjs/common';

import { PlayerAdvancementsModule } from '../player-advancements/player-advancements.module';
import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { AdvancementTableService } from './advancement-table.service';
import { AdvancementsDbRendererService } from './advancements-db-renderer.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { StoredUnspentSppCheckService } from './stored-unspent-spp-check.service';
import { UnspentSppOutsideRangeStratificationService } from './unspent-spp-outside-range-stratification.service';
import { UnspentSppTableService } from './unspent-spp-table.service';

/**
 * The imported advancement and unspent-SPP tables of the career history — each
 * stored advancement with its modelled cost and raw-source check, then the
 * modelled ranges beside the source's own figures — and the always-listed
 * stratum of players whose source-reported spend, or stored unspent SPP,
 * disagrees with the modelled range or the source.
 */
@Module({
  imports: [SharedModule, SourceModule, PlayerAdvancementsModule],
  providers: [
    AdvancementCostRangeService,
    AdvancementTableService,
    AdvancementsDbRendererService,
    PlayerAdvancementHistoryService,
    SourceSpendComparisonService,
    SourceUnspentSppFigureService,
    StoredUnspentSppCheckService,
    UnspentSppOutsideRangeStratificationService,
    UnspentSppTableService,
  ],
  exports: [
    AdvancementsDbRendererService,
    UnspentSppOutsideRangeStratificationService,
  ],
})
export class AdvancementCostsModule {}
