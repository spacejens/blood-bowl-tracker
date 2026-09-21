import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Message } from 'discord.js';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { TpFeedFormatterService } from './tp-feed-formatter.service';
import { TpFeedParserService } from './tp-feed-parser.service';

/**
 * Wires the TP notification feed to Discord: watches the configured source
 * channel, parses each message, and echoes a one-line interpretation to the
 * configured debug channel.
 *
 * The two channels are independently optional. With no source channel the
 * handler is never registered at all, so the feature costs nothing; with a
 * source but no debug channel the parsing (and its drift warnings) still run,
 * which is useful for watching the logs before committing to a channel.
 *
 * The source channel id is read once, at registration, and closed over: the
 * configuration cannot change while the process runs, so re-reading it per
 * message would buy nothing.
 */
@Injectable()
export class TpFeedListenerService implements OnModuleInit {
  private readonly logger = new Logger(TpFeedListenerService.name);

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly config: DiscordBotConfigService,
    private readonly parser: TpFeedParserService,
    private readonly formatter: TpFeedFormatterService,
  ) {}

  onModuleInit(): void {
    const sourceChannelId = this.config.getTpFeedSourceDiscordChannel();
    if (!sourceChannelId) {
      this.logger.log(
        'No TP feed source channel configured; not listening for TP notifications',
      );
      return;
    }
    this.logger.log(
      `Listening for TP notifications in channel ${sourceChannelId}`,
    );
    this.discordClient.registerMessageHandler((message) =>
      this.handleMessage(message, sourceChannelId),
    );
  }

  /**
   * Every message the bot can see reaches here, so the channel check comes
   * first and before any parsing work.
   *
   * A failed post is logged and dropped rather than retried or queued,
   * matching how the bot's other one-off messages behave (see
   * `startup-notifier.service.ts`): this output is diagnostic, and a missed
   * line is not worth the machinery.
   */
  private async handleMessage(
    message: Message,
    sourceChannelId: string,
  ): Promise<void> {
    if (message.channelId !== sourceChannelId) {
      return;
    }
    const event = this.parser.parse(message);
    if (!event) {
      return;
    }
    const debugChannelId = this.config.getTpFeedDebugDiscordChannel();
    if (!debugChannelId) {
      return;
    }
    try {
      await this.discordClient.sendMessage(debugChannelId, {
        content: this.formatter.format(event),
        // TP notification text is free-form and could contain something
        // that reads as a mention (e.g. a player or coach name starting
        // with @); nothing in this feed should ever ping anyone.
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      this.logger.error(
        'Failed to post TP feed interpretation',
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  }
}
