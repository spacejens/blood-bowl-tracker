import {
  ChildProcessModule,
  CliSharedModule,
} from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { DiscordBotTokenService } from './discord-bot-token/discord-bot-token.service';
import { FetchDiscordMessageService } from './fetch-discord-message/fetch-discord-message.service';
import { FetchRecentDiscordMessagesService } from './fetch-recent-discord-messages/fetch-recent-discord-messages.service';
import { ProductionEnvFileService } from './production-env-file/production-env-file.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';
import { ResetProductionSchemaService } from './reset-production-schema/reset-production-schema.service';
import { RunProductionQueryService } from './run-production-query/run-production-query.service';

@Module({
  imports: [CliSharedModule, ChildProcessModule],
  providers: [
    ProductionEnvFileService,
    DiscordBotTokenService,
    FetchDiscordMessageService,
    FetchRecentDiscordMessagesService,
    CheckProductionConfigPortService,
    ProductionTunnelService,
    RunProductionQueryService,
    ResetProductionSchemaService,
  ],
})
export class AppModule {}
