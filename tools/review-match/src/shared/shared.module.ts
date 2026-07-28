import { Module } from '@nestjs/common';

import { ExternalSystemLookupService } from './external-system-lookup.service';
import { HtmlService } from './html.service';
import { MatchCategoryLabelService } from './match-category-label.service';

/**
 * Cross-cutting services both the harness and every data-type module use.
 * Keeping them here (rather than in the harness) is what lets the harness
 * import data-type modules without a cycle.
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
