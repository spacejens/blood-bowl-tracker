import { Module } from '@nestjs/common';

import { InteractionEventsQueryService } from './interaction-events-query.service';
import { UsageEntityUpsertService } from './usage-entity-upsert.service';
import { UsageTrackingService } from './usage-tracking.service';

/**
 * No `forRootAsync` here: the only thing this module needs is the `DB` token,
 * which `DbModule` already provides globally, so importing this module is all
 * a consumer has to do.
 */
@Module({
  providers: [
    UsageTrackingService,
    UsageEntityUpsertService,
    InteractionEventsQueryService,
  ],
  exports: [UsageTrackingService, InteractionEventsQueryService],
})
export class DiscordBotUsageModule {}
