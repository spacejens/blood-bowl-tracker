import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { StatsSummaryService } from './insights/stats-summary.service';
import { DiscordBotConfigService } from './discord-bot-config.service';

@Injectable()
export class StartupNotifierService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupNotifierService.name);

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly statsSummary: StatsSummaryService,
    private readonly config: DiscordBotConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const channelId = this.config.getDiscordChannelId();
    const message = await this.statsSummary.buildSummaryMessage();
    await this.discordClient.sendMessage(channelId, message);
    this.logger.log(`Posted startup message to channel ${channelId}`);
  }
}
