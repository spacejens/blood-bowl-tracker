import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblMatchEventsRawRendererService } from './bbl-match-events-raw-renderer.service';
import { MatchEventStratificationService } from './match-event-stratification.service';
import { MatchEventsDbRendererService } from './match-events-db-renderer.service';
import { MatchEventsReviewerService } from './match-events-reviewer.service';
import { MergedMatchStratificationService } from './merged-match-stratification.service';
import { TpMatchEventsRawRendererService } from './tp-match-events-raw-renderer.service';
import { TpRawCodeLabelsService } from './tp-raw-code-labels.service';
import { TpRawWeatherLabelsService } from './tp-raw-weather-labels.service';

/**
 * The only data-type module in v1. It exports exactly the contract
 * implementations the harness consumes; everything else is internal.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblMatchEventsRawRendererService,
    MatchEventStratificationService,
    MatchEventsDbRendererService,
    MatchEventsReviewerService,
    MergedMatchStratificationService,
    TpMatchEventsRawRendererService,
    TpRawCodeLabelsService,
    TpRawWeatherLabelsService,
  ],
  exports: [
    MatchEventsReviewerService,
    MatchEventStratificationService,
    MergedMatchStratificationService,
  ],
})
export class MatchEventsModule {}
