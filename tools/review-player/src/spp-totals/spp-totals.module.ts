import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { PlayerSppComputedRendererService } from './player-spp-computed-renderer.service';
import { PlayerSppImportedRendererService } from './player-spp-imported-renderer.service';
import { PlayerSppLookupService } from './player-spp-lookup.service';
import { PlayerSppTotalsReviewerService } from './player-spp-totals-reviewer.service';
import { SppDiscrepancyStratificationService } from './spp-discrepancy-stratification.service';
import { SppMagnitudeStratificationService } from './spp-magnitude-stratification.service';
import { SppNonStandardContributionStratificationService } from './spp-non-standard-contribution-stratification.service';

/**
 * The spp-totals data type: a reviewer comparing each player's event-derived
 * SPP sum against their stored total, plus the SPP-focused strata — the
 * always-on discrepancy stratum that pulls every disagreeing player into the
 * report regardless of sample size, and the bounded magnitude strata that
 * cover the range of stored totals.
 */
@Module({
  imports: [SharedModule],
  providers: [
    PlayerSppComputedRendererService,
    PlayerSppImportedRendererService,
    PlayerSppLookupService,
    PlayerSppTotalsReviewerService,
    SppDiscrepancyStratificationService,
    SppMagnitudeStratificationService,
    SppNonStandardContributionStratificationService,
  ],
  exports: [
    PlayerSppTotalsReviewerService,
    SppDiscrepancyStratificationService,
    SppMagnitudeStratificationService,
    SppNonStandardContributionStratificationService,
  ],
})
export class SppTotalsModule {}
