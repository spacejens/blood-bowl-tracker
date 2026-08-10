import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger } from '@nestjs/common';

import { DeploymentInfoService } from './deployment-info.service';
import { DiscordBotConfigService } from './discord-bot-config.service';
import { InsightsCommandService } from './slash-commands/insights-command.service';

/**
 * The fact-tree path posted on every startup: a predictable "state of the
 * data" snapshot. Random variety is the scheduled random-insights job's job.
 */
const STARTUP_INSIGHT_CATEGORY = 'stats';

/** Discord's REST base, used only by the standby path. */
const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * Posts the boot announcement. Which method runs depends on leader election,
 * so this service deliberately has no lifecycle hook of its own.
 */
@Injectable()
export class StartupNotifierService {
  private readonly logger = new Logger(StartupNotifierService.name);

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly insightsCommand: InsightsCommandService,
    private readonly config: DiscordBotConfigService,
    private readonly deploymentInfo: DeploymentInfoService,
  ) {}

  /**
   * The elected machine's announcement: the deployment status line, then the
   * unfiltered stats insight, both through the gateway client. Errors
   * propagate — the caller treats a failure here as "could not become active".
   */
  async postActiveStartupMessage(): Promise<void> {
    const channelId = this.config.getStartupMessageDiscordChannel();
    await this.discordClient.sendMessage(
      channelId,
      this.deploymentInfo.describe('active'),
    );
    const message = await this.insightsCommand.resolveCategory(
      STARTUP_INSIGHT_CATEGORY,
      {},
    );
    await this.discordClient.sendMessage(channelId, message);
    this.logger.log(`Posted active startup message to channel ${channelId}`);
  }

  /**
   * The standby machine's announcement: one plain REST call, never the
   * gateway. A standby that opened a gateway session would receive (and race
   * to answer) the same interactions as the active machine, which is exactly
   * what leader election exists to prevent.
   *
   * Every failure is logged and swallowed: an unannounced standby is still a
   * perfectly healthy standby, ready to take over.
   */
  async postStandbyStartupMessage(): Promise<void> {
    try {
      const channelId = this.config.getStartupMessageDiscordChannel();
      const response = await fetch(
        `${DISCORD_API_BASE}/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bot ${this.config.getDiscordBotToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: this.deploymentInfo.describe('standby'),
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Discord API responded with ${response.status}`);
      }
      this.logger.log(`Posted standby startup message to channel ${channelId}`);
    } catch (error) {
      this.logger.error(
        'Failed to post standby startup message',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
