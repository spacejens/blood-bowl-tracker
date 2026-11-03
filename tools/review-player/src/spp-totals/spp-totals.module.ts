import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { PlayerSppLookupService } from './player-spp-lookup.service';
import { PlayerSppTotalsRendererService } from './player-spp-totals-renderer.service';
import { SppDiscrepancyStratificationService } from './spp-discrepancy-stratification.service';
import { SppMagnitudeStratificationService } from './spp-magnitude-stratification.service';
import { SppNonStandardContributionStratificationService } from './spp-non-standard-contribution-stratification.service';

/**
 * The SPP-total renderer the career history opens with — each player's stored
 * total beside the sum of their match events — plus the SPP-focused strata:
 * the always-on discrepancy stratum that pulls every disagreeing player into
 * the report regardless of sample size, and the bounded magnitude and
 * non-standard-award strata.
 */
@Module({
  imports: [SharedModule],
  providers: [
    PlayerSppLookupService,
    PlayerSppTotalsRendererService,
    SppDiscrepancyStratificationService,
    SppMagnitudeStratificationService,
    SppNonStandardContributionStratificationService,
  ],
  exports: [
    PlayerSppLookupService,
    PlayerSppTotalsRendererService,
    SppDiscrepancyStratificationService,
    SppMagnitudeStratificationService,
    SppNonStandardContributionStratificationService,
  ],
})
export class SppTotalsModule {}
