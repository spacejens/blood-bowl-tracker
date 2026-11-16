import {
  ChildProcessService,
  DatabaseUrlRedactorService,
  GitRootsService,
  PgClientService,
  ProcessRunnerService,
  ProductionEnvFileService,
  WriteFileService,
} from '@blood-bowl-tracker/cli-shared';
import { TpFeedAdvancementParserService } from '@blood-bowl-tracker/parse-tp-feed';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { DiscordBotTokenService } from './discord-bot-token/discord-bot-token.service';
import { DiscordRestService } from './discord-rest/discord-rest.service';
import { FetchDiscordMessageService } from './fetch-discord-message/fetch-discord-message.service';
import { FetchRecentDiscordMessagesService } from './fetch-recent-discord-messages/fetch-recent-discord-messages.service';
import { AdvancementPricingService } from './generate-incomplete-player-fills/advancement-pricing.service';
import { CharacteristicChangeService } from './generate-incomplete-player-fills/characteristic-change.service';
import { CharacteristicValidityService } from './generate-incomplete-player-fills/characteristic-validity.service';
import { FeedPlayerMatcherService } from './generate-incomplete-player-fills/feed-player-matcher.service';
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

describe('AppModule', () => {
  it('wires every production-ops subcommand service with its dependencies resolved', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(ProcessRunnerService)).toBeInstanceOf(
      ProcessRunnerService,
    );
    expect(moduleRef.get(GitRootsService)).toBeInstanceOf(GitRootsService);
    expect(moduleRef.get(ChildProcessService)).toBeInstanceOf(
      ChildProcessService,
    );
    expect(moduleRef.get(ProductionEnvFileService)).toBeInstanceOf(
      ProductionEnvFileService,
    );
    expect(moduleRef.get(DatabaseUrlRedactorService)).toBeInstanceOf(
      DatabaseUrlRedactorService,
    );
    expect(moduleRef.get(PgClientService)).toBeInstanceOf(PgClientService);
    expect(moduleRef.get(DiscordBotTokenService)).toBeInstanceOf(
      DiscordBotTokenService,
    );
    expect(moduleRef.get(DiscordRestService)).toBeInstanceOf(
      DiscordRestService,
    );
    expect(moduleRef.get(FetchRecentDiscordMessagesService)).toBeInstanceOf(
      FetchRecentDiscordMessagesService,
    );
    expect(moduleRef.get(FetchDiscordMessageService)).toBeInstanceOf(
      FetchDiscordMessageService,
    );
    expect(moduleRef.get(CheckProductionConfigPortService)).toBeInstanceOf(
      CheckProductionConfigPortService,
    );
    expect(moduleRef.get(ProductionTunnelService)).toBeInstanceOf(
      ProductionTunnelService,
    );
    expect(moduleRef.get(RunProductionQueryService)).toBeInstanceOf(
      RunProductionQueryService,
    );
    expect(moduleRef.get(WriteFileService)).toBeInstanceOf(WriteFileService);
    expect(moduleRef.get(CharacteristicValidityService)).toBeInstanceOf(
      CharacteristicValidityService,
    );
    expect(moduleRef.get(AdvancementPricingService)).toBeInstanceOf(
      AdvancementPricingService,
    );
    expect(moduleRef.get(CharacteristicChangeService)).toBeInstanceOf(
      CharacteristicChangeService,
    );
    expect(moduleRef.get(LastingInjuryProofService)).toBeInstanceOf(
      LastingInjuryProofService,
    );
    expect(moduleRef.get(FeedPlayerMatcherService)).toBeInstanceOf(
      FeedPlayerMatcherService,
    );
    expect(moduleRef.get(FillSectionRendererService)).toBeInstanceOf(
      FillSectionRendererService,
    );
    expect(moduleRef.get(GenerateIncompletePlayerFillsService)).toBeInstanceOf(
      GenerateIncompletePlayerFillsService,
    );
    expect(moduleRef.get(IncompletePlayerFillPlannerService)).toBeInstanceOf(
      IncompletePlayerFillPlannerService,
    );
    expect(moduleRef.get(IncompletePlayerFillQueriesService)).toBeInstanceOf(
      IncompletePlayerFillQueriesService,
    );
    expect(moduleRef.get(PositionProfileService)).toBeInstanceOf(
      PositionProfileService,
    );
    expect(moduleRef.get(ProductionJsonQueryService)).toBeInstanceOf(
      ProductionJsonQueryService,
    );
    expect(moduleRef.get(ReadTpFeedHistoryService)).toBeInstanceOf(
      ReadTpFeedHistoryService,
    );
    expect(moduleRef.get(TpFeedHistoryStoreService)).toBeInstanceOf(
      TpFeedHistoryStoreService,
    );
    expect(moduleRef.get(TpFeedHistoryIndexService)).toBeInstanceOf(
      TpFeedHistoryIndexService,
    );
    expect(moduleRef.get(SnowflakeOrderService)).toBeInstanceOf(
      SnowflakeOrderService,
    );
    expect(moduleRef.get(TpFeedAdvancementParserService)).toBeInstanceOf(
      TpFeedAdvancementParserService,
    );
  });
});
