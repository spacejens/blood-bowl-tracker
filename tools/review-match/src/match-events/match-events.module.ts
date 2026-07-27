import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblMatchEventsRawRendererService } from './bbl-match-events-raw-renderer.service';
import { MatchEventStratificationService } from './match-event-stratification.service';
import { MatchEventsDbRendererService } from './match-events-db-renderer.service';
import { MatchEventsReviewerService } from './match-events-reviewer.service';
import { TpMatchEventsRawRendererService } from './tp-match-events-raw-renderer.service';
import { TpRawCodeLabelService } from './tp-raw-code-labels.service';

/**
 * The only data-type module in v1. It exports exactly the two contract
 * implementations the harness consumes; everything else is internal.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblMatchEventsRawRendererService,
    MatchEventStratificationService,
    MatchEventsDbRendererService,
    MatchEventsReviewerService,
    TpMatchEventsRawRendererService,
    TpRawCodeLabelService,
  ],
  exports: [MatchEventsReviewerService, MatchEventStratificationService],
})
export class MatchEventsModule {}
