import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';

const STARTUP_MESSAGE = 'Hello tLoEG, I am alive';

@Injectable()
export class StartupNotifierService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupNotifierService.name);

  constructor(private readonly discordClient: DiscordClientService) {}

  async onApplicationBootstrap(): Promise<void> {
    const channelId = process.env.DISCORD_CHANNEL_ID;
    if (!channelId) {
      throw new Error('DISCORD_CHANNEL_ID is not configured');
    }
    await this.discordClient.sendMessage(channelId, STARTUP_MESSAGE);
    this.logger.log(`Posted startup message to channel ${channelId}`);
  }
}
