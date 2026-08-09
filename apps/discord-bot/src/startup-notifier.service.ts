import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { DiscordBotConfigService } from './discord-bot-config.service';
import { InsightsCommandService } from './slash-commands/insights-command.service';

@Injectable()
export class StartupNotifierService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupNotifierService.name);

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly insightsCommand: InsightsCommandService,
    private readonly config: DiscordBotConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const channelId = this.config.getStartupMessageDiscordChannel();
    const message = await this.insightsCommand.resolveRandomFact();
    await this.discordClient.sendMessage(channelId, message);
    this.logger.log(`Posted startup message to channel ${channelId}`);
  }
}
