import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SppComputedRendererService } from './spp-computed-renderer.service';
import { SppImportedRendererService } from './spp-imported-renderer.service';
import { SppTotalsLookupService } from './spp-totals-lookup.service';
import { SppTotalsReviewerService } from './spp-totals-reviewer.service';

/**
 * The SPP-totals data type. It contributes a reviewer but no stratifier: the
 * matches worth checking are already chosen by the existing strata, and this
 * data type is about what those matches' players add up to.
 */
@Module({
  imports: [SharedModule],
  providers: [
    SppComputedRendererService,
    SppImportedRendererService,
    SppTotalsLookupService,
    SppTotalsReviewerService,
  ],
  exports: [SppTotalsReviewerService],
})
export class SppTotalsModule {}
