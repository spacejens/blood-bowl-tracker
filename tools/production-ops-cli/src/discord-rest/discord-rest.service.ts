import { Injectable } from '@nestjs/common';
import { DiscordAPIError, REST, RouteLike, Routes } from 'discord.js';

import { DiscordBotTokenService } from '../discord-bot-token/discord-bot-token.service';

/** The Discord API version `packages/discord-client` also pins. */
const DISCORD_API_VERSION = '10';

/**
 * Bounds the whole request. discord.js aborts a request that takes longer
 * than this, so a stalled response cannot hang the CLI forever.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/** What to request, and how to name it in an error message. */
interface DiscordGetRequest {
  readonly route: RouteLike;
  readonly query?: URLSearchParams;
  readonly target: string;
}

/**
 * The production-ops CLI's one door to Discord's REST API, through the
 * discord.js `REST` client: it supplies the base URL, `Bot` authorization,
 * rate-limit handling, retries and the request timeout. Every method returns
 * Discord's response verbatim, so embeds, attachments and every other field
 * survive intact. Failures name the requested target, never the token.
 */
@Injectable()
export class DiscordRestService {
  constructor(private readonly botToken: DiscordBotTokenService) {}

  getMessage(channelId: string, messageId: string): Promise<unknown> {
    return this.get({
      route: Routes.channelMessage(channelId, messageId),
      target: `message ${messageId} in channel ${channelId}`,
    });
  }

  getRecentMessages(channelId: string, count: number): Promise<unknown> {
    return this.get({
      route: Routes.channelMessages(channelId),
      query: new URLSearchParams({ limit: String(count) }),
      target: `the ${count} most recent messages of channel ${channelId}`,
    });
  }

  private async get(request: DiscordGetRequest): Promise<unknown> {
    const rest = await this.createClient();
    try {
      return request.query === undefined
        ? await rest.get(request.route)
        : await rest.get(request.route, { query: request.query });
    } catch (error) {
      throw new Error(this.describeFailure(request.target, error), {
        cause: error,
      });
    }
  }

  /**
   * Built per call: one request per CLI process, and the token is read only
   * once the caller's own input validation has passed.
   */
  private async createClient(): Promise<REST> {
    const token = await this.botToken.read();
    return new REST({
      version: DISCORD_API_VERSION,
      timeout: REQUEST_TIMEOUT_MS,
    }).setToken(token);
  }

  /** Never includes request headers, so the token cannot leak. */
  private describeFailure(target: string, error: unknown): string {
    const prefix = `Discord API request for ${target} failed`;
    if (error instanceof DiscordAPIError) {
      return (
        `${prefix} with status ${error.status} (code ${String(error.code)}): ` +
        error.message
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return `${prefix}: ${message}`;
  }
}
