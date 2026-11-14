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
    ReadTpFeedHistoryService,
    SnowflakeOrderService,
    TpFeedHistoryIndexService,
    TpFeedHistoryStoreService,
  ],
})
export class AppModule {}
