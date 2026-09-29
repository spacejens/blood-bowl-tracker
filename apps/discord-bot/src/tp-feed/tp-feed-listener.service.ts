import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { TpFeedFormatterService } from './tp-feed-formatter.service';
import { TpFeedImportService } from './tp-feed-import.service';
import { TpFeedParserService } from './tp-feed-parser.service';

/** Discord's `:heavy_check_mark:`, marking a source message as handled. */
const PROCESSED_REACTION = '✔️';

/**
 * Wires the TP notification feed to Discord: watches the configured source
 * channel, parses each message, echoes a one-line interpretation to the
 * configured debug channel and imports what the notification is about through
 * `TpFeedImportService` — or, for a message that looks like a TP
 * notification but does not parse, a one-line notice linking back to it.
 *
 * The two channels are independently optional. With no source channel the
 * handler is never registered at all, so the feature costs nothing; with a
 * source but no debug channel the parsing (and its drift warnings) and the
 * imports still run, and import failures are only logged, which is useful
 * for watching the logs before committing to a channel.
 *
 * The source channel id is read once, at registration, and closed over: the
 * configuration cannot change while the process runs, so re-reading it per
 * message would buy nothing.
 *
 * Every source message that is fully, successfully handled also gets a ✔️
 * reaction, so the source channel itself shows at a glance which messages
 * were handled and, by omission, which were not: missed entirely (downtime,
 * a crash, or a message that arrived before the bot was listening), not
 * understood (an unrecognized notification), not fully processed (a
 * failed debug-channel post), not imported (a real import failure), or not
 * imported at all because `TP_SCRAPING_ENABLED` is false.
 */
@Injectable()
export class TpFeedListenerService implements OnModuleInit {
  private readonly logger = new Logger(TpFeedListenerService.name);

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly config: DiscordBotConfigService,
    private readonly parser: TpFeedParserService,
    private readonly formatter: TpFeedFormatterService,
    private readonly feedImport: TpFeedImportService,
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
   * The ✔️ reaction means the message was fully, successfully handled, so it
   * is added only when processing actually finished: the parser ignored the
   * message, or it parsed as an event, its description was posted (or there
   * is no debug channel), and its import had no real failure. A failed
   * import is posted to the debug channel when there is one — once per
   * import, so a trophy announcement merged into an already-queued import
   * does not post that import's failure again; either way it withholds the
   * reaction.
   *
   * When `TP_SCRAPING_ENABLED` is false a parsed event is still described in
   * the debug channel, but never enqueued for import — so nothing reaches TP —
   * and the reaction is withheld, since the notification was not imported.
   *
   * An unrecognized message is never reacted to: classifying it as
   * unrecognized is not handling it. It is still reported to the debug
   * channel when one is configured, but the reaction is withheld whether
   * that post succeeds, fails, or is skipped for lack of a debug channel.
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
    if (result.status === 'unrecognized') {
      if (debugChannelId) {
        // `message.url` is discord.js's own jump-link getter
        // (https://discord.com/channels/<guild>/<channel>/<message>), so a
        // maintainer can open the message that did not parse.
        await this.postToDebugChannel(
          debugChannelId,
          this.formatter.formatUnrecognized(message.url),
        );
      }
      return;
    }
    if (!this.config.getTpScrapingEnabled()) {
      // TP scraping is switched off: the notification is still interpreted
      // and echoed, but nothing is imported, so it was not fully handled and
      // gets no reaction.
      if (debugChannelId) {
        await this.postToDebugChannel(
          debugChannelId,
          this.formatter.format(result.event),
        );
      }
      return;
    }
    // Enqueued before the first await, so imports queue in arrival order.
    const imported = this.feedImport.enqueue(result.event);
    const described =
      !debugChannelId ||
      (await this.postToDebugChannel(
        debugChannelId,
        this.formatter.format(result.event),
      ));
    const importResult = await imported;
    if (
      importResult.failed &&
      !importResult.alreadyReported &&
      debugChannelId
    ) {
      await this.postToDebugChannel(
        debugChannelId,
        this.formatter.formatImportFailure(importResult, result.event.link),
      );
    }
    if (described && !importResult.failed) {
      await this.markProcessed(message);
    }
  }

  /**
   * Posts one line to the debug channel. Returns whether the post succeeded;
   * a failure is logged and swallowed so the caller only has to decide
   * whether to mark the source message processed.
   */
  private async postToDebugChannel(
    channelId: string,
    content: string,
  ): Promise<boolean> {
    try {
      await this.discordClient.sendMessage(channelId, {
        content,
        // TP notification text is free-form and could contain something
        // that reads as a mention (e.g. a player or coach name starting
        // with @); nothing in this feed should ever ping anyone.
        allowedMentions: { parse: [] },
        // The debug channel is a quick, scannable log; the tourplay.net and
        // Discord jump links stay clickable, but Discord renders no preview
        // card under them.
        flags: [MessageFlags.SuppressEmbeds],
      });
      return true;
    } catch (error) {
      this.logFailure('Failed to post TP feed message', error);
      return false;
    }
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
