import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger } from '@nestjs/common';

import { DeploymentInfoService } from './deployment-info.service';
import { DiscordBotConfigService } from './discord-bot-config.service';

/**
 * Posts the boot announcement. Which method runs depends on leader election,
 * so this service deliberately has no lifecycle hook of its own.
 */
@Injectable()
export class StartupNotifierService {
  private readonly logger = new Logger(StartupNotifierService.name);

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly config: DiscordBotConfigService,
    private readonly deploymentInfo: DeploymentInfoService,
  ) {}

  /**
   * The elected machine's announcement: the deployment status line, through
   * the gateway client. Errors propagate — the caller treats a failure here
   * as "could not become active".
   */
  async postActiveStartupMessage(): Promise<void> {
    const channelId = this.config.getStartupMessageDiscordChannel();
    await this.discordClient.sendMessage(
      channelId,
      this.deploymentInfo.describe('active'),
    );
    this.logger.log(`Posted active startup message to channel ${channelId}`);
  }

  /**
   * The standby machine's announcement: one plain REST call, never the
   * gateway. A standby that opened a gateway session would receive (and race
   * to answer) the same interactions as the active machine, which is exactly
   * what leader election exists to prevent.
   *
   * Skipped entirely when STANDBY_STARTUP_MESSAGE_ENABLED is off — a
   * standby's availability is not news, and where restarts are frequent the
   * announcement is pure noise. The skip is logged so a missing message is
   * never mistaken for a failure to post one.
   *
   * Every failure is logged and swallowed: an unannounced standby is still a
   * perfectly healthy standby, ready to take over.
   */
  async postStandbyStartupMessage(): Promise<void> {
    if (!this.config.getStandbyStartupMessageEnabled()) {
      this.logger.log(
        'Standby startup message is disabled; skipping the announcement',
      );
      return;
    }
    try {
      const channelId = this.config.getStartupMessageDiscordChannel();
      // `describe()` already returns `{ embeds: [...] }`, exactly the shape
      // Discord's message-create endpoint expects — the same value the
      // active path passes to sendMessage as InteractionReplyOptions.
      await this.discordClient.sendMessageOverRest(
        channelId,
        this.deploymentInfo.describe('standby'),
      );
      this.logger.log(`Posted standby startup message to channel ${channelId}`);
    } catch (error) {
      this.logger.error(
        'Failed to post standby startup message',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
