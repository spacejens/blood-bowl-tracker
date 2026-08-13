import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Module } from '@nestjs/common';

import { ExternalSystemLookupService } from './external-system-lookup.service';
import { MatchCategoryLabelService } from './match-category-label.service';

/**
 * Cross-cutting services both the harness and every data-type module use.
 * Keeping them here (rather than in the harness) is what lets the harness
 * import data-type modules without a cycle. `HtmlService` comes from
 * `@blood-bowl-tracker/review-harness`; it is still provided here so every
 * data-type module injects it through this one module, alongside this tool's
 * own cross-cutting services.
 */
@Module({
  providers: [
    ExternalSystemLookupService,
    HtmlService,
    MatchCategoryLabelService,
  ],
  exports: [
    ExternalSystemLookupService,
    HtmlService,
    MatchCategoryLabelService,
  ],
})
export class SharedModule {}
