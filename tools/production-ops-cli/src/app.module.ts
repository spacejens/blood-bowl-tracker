import {
  ChildProcessModule,
  CliSharedModule,
  DiscordRestModule,
  ProductionQueryModule,
} from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

import { CheckProductionConfigPortService } from './check-production-config-port/check-production-config-port.service';
import { FetchDiscordMessageService } from './fetch-discord-message/fetch-discord-message.service';
import { FetchRecentDiscordMessagesService } from './fetch-recent-discord-messages/fetch-recent-discord-messages.service';
import { ProductionTunnelService } from './production-tunnel/production-tunnel.service';

@Module({
  imports: [
    CliSharedModule,
    ChildProcessModule,
    DiscordRestModule,
    ProductionQueryModule,
  ],
  providers: [
    FetchDiscordMessageService,
    FetchRecentDiscordMessagesService,
    CheckProductionConfigPortService,
    ProductionTunnelService,
  ],
})
export class AppModule {}
