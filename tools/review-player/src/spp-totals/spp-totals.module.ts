import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { PlayerSppComputedRendererService } from './player-spp-computed-renderer.service';
import { PlayerSppImportedRendererService } from './player-spp-imported-renderer.service';
import { PlayerSppLookupService } from './player-spp-lookup.service';
import { PlayerSppTotalsReviewerService } from './player-spp-totals-reviewer.service';
import { SppDiscrepancyStratificationService } from './spp-discrepancy-stratification.service';

/**
 * The spp-totals data type: a reviewer comparing each player's event-derived
 * SPP sum against their stored total, plus the always-on discrepancy stratum
 * that pulls every disagreeing player into the report regardless of sample
 * size.
 */
@Module({
  imports: [SharedModule],
  providers: [
    PlayerSppComputedRendererService,
    PlayerSppImportedRendererService,
    PlayerSppLookupService,
    PlayerSppTotalsReviewerService,
    SppDiscrepancyStratificationService,
  ],
  exports: [
    PlayerSppTotalsReviewerService,
    SppDiscrepancyStratificationService,
  ],
})
export class SppTotalsModule {}
