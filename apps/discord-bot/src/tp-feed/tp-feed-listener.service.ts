import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Message } from 'discord.js';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { TpFeedFormatterService } from './tp-feed-formatter.service';
import { TpFeedParserService } from './tp-feed-parser.service';

/** Discord's `:heavy_check_mark:`, marking a source message as handled. */
const PROCESSED_REACTION = '✔️';

/**
 * Wires the TP notification feed to Discord: watches the configured source
 * channel, parses each message, and echoes a one-line interpretation to the
 * configured debug channel — or, for a message that looks like a TP
 * notification but does not parse, a one-line notice linking back to it.
 *
 * The two channels are independently optional. With no source channel the
 * handler is never registered at all, so the feature costs nothing; with a
 * source but no debug channel the parsing (and its drift warnings) still run,
 * which is useful for watching the logs before committing to a channel.
 *
 * The source channel id is read once, at registration, and closed over: the
 * configuration cannot change while the process runs, so re-reading it per
 * message would buy nothing.
 *
 * Every source message whose processing completes cleanly also gets a ✔️
 * reaction, so the source channel itself shows at a glance which messages
 * were handled and, by omission, which were missed (downtime, a crash, or a
 * message that arrived before the bot was listening).
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
   * The ✔️ reaction is added once, at the end of whichever branch finishes
   * processing: the parser ignored the message, there is no debug channel to
   * post to, or the post succeeded. A failed post does not count as finished
   * processing, so it gets no reaction.
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
    const result = this.parser.parse(message);
    if (result.status === 'ignored') {
      await this.markProcessed(message);
      return;
    }
    const debugChannelId = this.config.getTpFeedDebugDiscordChannel();
    if (!debugChannelId) {
      await this.markProcessed(message);
      return;
    }
    // `message.url` is discord.js's own jump-link getter
    // (https://discord.com/channels/<guild>/<channel>/<message>), so a
    // maintainer can open the message that did not parse.
    const content =
      result.status === 'event'
        ? this.formatter.format(result.event)
        : this.formatter.formatUnrecognized(message.url);
    try {
      await this.discordClient.sendMessage(debugChannelId, {
        content,
        // TP notification text is free-form and could contain something
        // that reads as a mention (e.g. a player or coach name starting
        // with @); nothing in this feed should ever ping anyone.
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      this.logFailure('Failed to post TP feed message', error);
      return;
    }
    await this.markProcessed(message);
  }

  /**
   * Reacts directly on the message object already in hand — no channel
   * fetch is needed. A failure (missing permission, message already
   * deleted, API error) is logged and dropped, like a failed post.
   */
  private async markProcessed(message: Message): Promise<void> {
    try {
      await message.react(PROCESSED_REACTION);
    } catch (error) {
      this.logFailure('Failed to react to TP feed message', error);
    }
  }

  private logFailure(summary: string, error: unknown): void {
    this.logger.error(
      summary,
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
  }
}
