import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { EligibilityMismatchStratificationService } from './eligibility-mismatch-stratification.service';
import { HireEligibilityDbRendererService } from './hire-eligibility-db-renderer.service';
import { HireEligibilityRawRendererService } from './hire-eligibility-raw-renderer.service';
import { HireEligibilityReviewerService } from './hire-eligibility-reviewer.service';
import { MercenaryVsEmbeddedStratificationService } from './mercenary-vs-embedded-stratification.service';

/**
 * The hire-eligibility data type: which races/rosters/eras each source, and
 * `positions_race_eras`, say may hire this star, and the strata that sample
 * eligibility/characteristics mismatches and mercenary-vs-roster-embedded
 * stars.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    EligibilityMismatchStratificationService,
    MercenaryVsEmbeddedStratificationService,
    HireEligibilityDbRendererService,
    HireEligibilityRawRendererService,
    HireEligibilityReviewerService,
  ],
  exports: [
    EligibilityMismatchStratificationService,
    MercenaryVsEmbeddedStratificationService,
    HireEligibilityReviewerService,
  ],
})
export class StarPlayerHireEligibilityModule {}
