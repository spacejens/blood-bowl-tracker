import { Injectable } from '@nestjs/common';

import { DiscordRestService } from '../discord-rest/discord-rest.service';
import { SnowflakeOrderService } from './snowflake-order.service';
import { TpFeedHistoryIndexService } from './tp-feed-history-index.service';
import {
  TpFeedHistoryState,
  TpFeedHistoryStoreService,
} from './tp-feed-history-store.service';
import {
  discordChannelSchema,
  TpFeedMessage,
  tpFeedPageSchema,
} from './tp-feed-message.schema';

/** Discord's maximum page size for the channel-messages endpoint. */
export const PAGE_SIZE = 100;

/** What `read-tp-feed-history` prints. */
export interface ReadTpFeedHistorySummary {
  readonly channelId: string;
  readonly dataDir: string;
  readonly pagesFetched: number;
  readonly messagesSeen: number;
  /** Advancement messages saved for the first time in this run. */
  readonly newReports: number;
  /** Unparsed advancement messages across the whole saved history. */
  readonly unparsed: number;
  readonly reachedStart: boolean;
  /** The failure that stopped the run early, or null. */
  readonly stoppedByError: string | null;
}

/** One run's progress, updated as pages are fetched. */
interface RunContext {
  readonly channelId: string;
  readonly maxPages: number;
  state: TpFeedHistoryState;
  pagesFetched: number;
  messagesSeen: number;
  newReports: number;
  stoppedByError: string | null;
}

/** Which way to page: newer than `after`, or older than `before`. */
interface PageCursor {
  readonly after?: string;
  readonly before?: string;
}

/**
 * Reads a TP feed channel's history into local evidence. It catches up on
 * messages newer than the saved newest, then pages backwards to the
 * channel's start or the page budget, saving advancement messages and the
 * state after every page, then regenerates the index files. A failed page
 * ends the run with a summary rather than an error, so a rerun resumes.
 */
@Injectable()
export class ReadTpFeedHistoryService {
  constructor(
    private readonly discordRest: DiscordRestService,
    private readonly store: TpFeedHistoryStoreService,
    private readonly index: TpFeedHistoryIndexService,
    private readonly snowflakes: SnowflakeOrderService,
  ) {}

  async run(
    channelId: string,
    maxPages?: number,
  ): Promise<ReadTpFeedHistorySummary> {
    // Runs before anything else, so before the token is read.
    this.validate(channelId, maxPages);
    const context: RunContext = {
      channelId,
      maxPages: maxPages ?? Number.POSITIVE_INFINITY,
      state: await this.initialState(channelId),
      pagesFetched: 0,
      messagesSeen: 0,
      newReports: 0,
      stoppedByError: null,
    };
    await this.catchUp(context);
    await this.readBackwards(context);
    const built = this.index.build({
      messages: await this.store.readMessages(channelId),
      guildId: context.state.guildId,
      channelId,
    });
    await this.store.writeIndex(channelId, built);
    return {
      channelId,
      dataDir: await this.store.directory(channelId),
      pagesFetched: context.pagesFetched,
      messagesSeen: context.messagesSeen,
      newReports: context.newReports,
      unparsed: built.unparsed.length,
      reachedStart: context.state.reachedStart,
      stoppedByError: context.stoppedByError,
    };
  }

  private validate(channelId: string, maxPages: number | undefined): void {
    if (!/^\d+$/u.test(channelId)) {
      throw new Error(
        `channel id must be a Discord snowflake (digits only), got '${channelId}'.`,
      );
    }
    if (
      maxPages !== undefined &&
      (!Number.isInteger(maxPages) || maxPages < 1)
    ) {
      throw new Error(
        `max pages must be a positive integer, got ${String(maxPages)}.`,
      );
    }
  }

  /**
   * The saved state, or a fresh one when nothing was fetched yet. A fresh
   * state needs the channel's guild id, so message links can be built.
   */
  private async initialState(channelId: string): Promise<TpFeedHistoryState> {
    const saved = await this.store.readState(channelId);
    if (saved !== null && saved.newestId !== null) return saved;
    const channel = discordChannelSchema.safeParse(
      await this.discordRest.getChannel(channelId),
    );
    if (!channel.success) {
      throw new Error(
        `Channel ${channelId} is not a server channel (Discord returned no ` +
          'guild_id), so message links cannot be built.',
      );
    }
    return {
      guildId: channel.data.guild_id,
      newestId: null,
      oldestId: null,
      reachedStart: false,
    };
  }

  /** Pages forward from the saved newest message while pages come back full. */
  private async catchUp(context: RunContext): Promise<void> {
    let after = context.state.newestId;
    while (after !== null && this.canFetch(context)) {
      const page = await this.fetchPage(context, { after });
      if (page === null || page.length === 0) return;
      const newest = this.snowflakes.newest(page.map((message) => message.id));
      if (this.snowflakes.compare(newest, after) <= 0) {
        this.stopWithoutProgress(context, `after=${after}`);
        return;
      }
      await this.storePage(context, page);
      after = newest;
      await this.saveState(context, { ...context.state, newestId: after });
      if (page.length < PAGE_SIZE) return;
    }
  }

  /** Pages back from the saved oldest message until a short page. */
  private async readBackwards(context: RunContext): Promise<void> {
    while (!context.state.reachedStart && this.canFetch(context)) {
      const before = context.state.oldestId ?? undefined;
      const page = await this.fetchPage(context, { before });
      if (page === null) return;
      const ids = page.map((message) => message.id);
      const hasIds = ids.length > 0;
      if (
        before !== undefined &&
        hasIds &&
        this.snowflakes.compare(this.snowflakes.oldest(ids), before) >= 0
      ) {
        this.stopWithoutProgress(context, `before=${before}`);
        return;
      }
      await this.storePage(context, page);
      await this.saveState(context, {
        ...context.state,
        newestId:
          context.state.newestId ??
          (hasIds ? this.snowflakes.newest(ids) : null),
        oldestId: hasIds ? this.snowflakes.oldest(ids) : context.state.oldestId,
        reachedStart: page.length < PAGE_SIZE,
      });
    }
  }

  /** A page that does not move the cursor would repeat forever. */
  private stopWithoutProgress(context: RunContext, cursor: string): void {
    context.stoppedByError =
      `Discord returned a page that does not move past ${cursor}, ` +
      'so paging stopped.';
  }

  private canFetch(context: RunContext): boolean {
    return (
      context.stoppedByError === null && context.pagesFetched < context.maxPages
    );
  }

  /** One page, or null after recording why it could not be had. */
  private async fetchPage(
    context: RunContext,
    cursor: PageCursor,
  ): Promise<TpFeedMessage[] | null> {
    let body: unknown;
    try {
      body =
        cursor.after === undefined
          ? await this.discordRest.getRecentMessages(
              context.channelId,
              PAGE_SIZE,
              cursor.before,
            )
          : await this.discordRest.getMessagesAfter(
              context.channelId,
              PAGE_SIZE,
              cursor.after,
            );
    } catch (error) {
      context.stoppedByError =
        error instanceof Error ? error.message : String(error);
      return null;
    }
    const page = tpFeedPageSchema.safeParse(body);
    if (!page.success) {
      context.stoppedByError =
        'Discord returned a message page of an unexpected shape: ' +
        page.error.message;
      return null;
    }
    context.pagesFetched += 1;
    return page.data;
  }

  private async storePage(
    context: RunContext,
    page: readonly TpFeedMessage[],
  ): Promise<void> {
    context.messagesSeen += page.length;
    for (const message of page) {
      if (!this.index.isAdvancement(message)) continue;
      if (await this.store.saveMessage(context.channelId, message)) {
        context.newReports += 1;
      }
    }
  }

  private async saveState(
    context: RunContext,
    state: TpFeedHistoryState,
  ): Promise<void> {
    context.state = state;
    await this.store.writeState(context.channelId, state);
  }
}
