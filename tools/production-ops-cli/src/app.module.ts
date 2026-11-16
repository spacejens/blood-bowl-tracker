import {
  ChildProcessModule,
  CliSharedModule,
} from '@blood-bowl-tracker/cli-shared';
import { ParseTpFeedModule } from '@blood-bowl-tracker/parse-tp-feed';
import { Module } from '@nestjs/common';

import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { DiscordBotTokenService } from './discord-bot-token/discord-bot-token.service';
import { DiscordRestService } from './discord-rest/discord-rest.service';
import { FetchDiscordMessageService } from './fetch-discord-message/fetch-discord-message.service';
import { FetchRecentDiscordMessagesService } from './fetch-recent-discord-messages/fetch-recent-discord-messages.service';
import { AdvancementPricingService } from './generate-incomplete-player-fills/advancement-pricing.service';
import { CharacteristicChangeService } from './generate-incomplete-player-fills/characteristic-change.service';
import { CharacteristicValidityService } from './generate-incomplete-player-fills/characteristic-validity.service';
import { FeedPlayerMatcherService } from './generate-incomplete-player-fills/feed-player-matcher.service';
import { FeedSkillResolverService } from './generate-incomplete-player-fills/feed-skill-resolver.service';
import { FillEntryBuilderService } from './generate-incomplete-player-fills/fill-entry-builder.service';
import { FillSectionRendererService } from './generate-incomplete-player-fills/fill-section-renderer.service';
import { GenerateIncompletePlayerFillsService } from './generate-incomplete-player-fills/generate-incomplete-player-fills.service';
import { IncompletePlayerFillPlannerService } from './generate-incomplete-player-fills/incomplete-player-fill-planner.service';
import { IncompletePlayerFillQueriesService } from './generate-incomplete-player-fills/incomplete-player-fill-queries.service';
import { LastingInjuryProofService } from './generate-incomplete-player-fills/lasting-injury-proof.service';
import { PositionProfileService } from './generate-incomplete-player-fills/position-profile.service';
import { ProductionJsonQueryService } from './generate-incomplete-player-fills/production-json-query.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ReadTpFeedHistoryService } from './read-tp-feed-history/read-tp-feed-history.service';
import { SnowflakeOrderService } from './read-tp-feed-history/snowflake-order.service';
import { TpFeedHistoryIndexService } from './read-tp-feed-history/tp-feed-history-index.service';
import { TpFeedHistoryStoreService } from './read-tp-feed-history/tp-feed-history-store.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';

@Module({
  imports: [CliSharedModule, ChildProcessModule, ParseTpFeedModule],
  providers: [
    DiscordBotTokenService,
    DiscordRestService,
    FetchDiscordMessageService,
    FetchRecentDiscordMessagesService,
    CheckProductionConfigPortService,
    ProductionTunnelService,
    RunProductionQueryService,
    CharacteristicValidityService,
    AdvancementPricingService,
    CharacteristicChangeService,
    LastingInjuryProofService,
    FeedPlayerMatcherService,
    FeedSkillResolverService,
    FillSectionRendererService,
    GenerateIncompletePlayerFillsService,
    FillEntryBuilderService,
    IncompletePlayerFillPlannerService,
    IncompletePlayerFillQueriesService,
    PositionProfileService,
    ProductionJsonQueryService,
    ReadTpFeedHistoryService,
    SnowflakeOrderService,
    TpFeedHistoryIndexService,
    TpFeedHistoryStoreService,
  ],
})
export class AppModule {}
