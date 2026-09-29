import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger } from '@nestjs/common';
import { MessageFlags } from 'discord.js';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { TpFeedFormatterService } from './tp-feed-formatter.service';

/**
 * Tells maintainers when TP starts blocking the bot and when imports
 * resume: one line each, always logged and posted to the TP feed's debug
 * channel when one is configured. The feed import queue calls it once per
 * block and once per resumption, never per failed job. A failed post is
 * logged and dropped, like the feed's other debug-channel lines.
 */
@Injectable()
export class TpFeedBlockNoticeService {
  private readonly logger = new Logger(TpFeedBlockNoticeService.name);

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly config: DiscordBotConfigService,
    private readonly formatter: TpFeedFormatterService,
  ) {}

  async announceBlocked(retryAt: Date): Promise<void> {
    const content = this.formatter.formatBlocked(retryAt);
    this.logger.warn(content);
    await this.post(content);
  }

  async announceResumed(): Promise<void> {
    const content = this.formatter.formatResumed();
    this.logger.log(content);
    await this.post(content);
  }

  private async post(content: string): Promise<void> {
    const channelId = this.config.getTpFeedDebugDiscordChannel();
    if (!channelId) {
      return;
    }
    try {
      await this.discordClient.sendMessage(channelId, {
        content,
        allowedMentions: { parse: [] },
        flags: [MessageFlags.SuppressEmbeds],
      });
    } catch (error) {
      this.logger.error(
        'Failed to post TP block/resume notice',
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  }
}
