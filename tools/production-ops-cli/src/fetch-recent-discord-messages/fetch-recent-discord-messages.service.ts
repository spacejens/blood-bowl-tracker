import { Injectable } from '@nestjs/common';

import { DiscordBotTokenService } from '../discord-bot-token/discord-bot-token.service';

/** Matches the API version `packages/discord-client` already pins. */
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

/** Discord's own bounds on the `limit` query parameter for this endpoint. */
const MIN_COUNT = 1;
const MAX_COUNT = 100;

/**
 * Fetches the most recent messages of one Discord channel and returns
 * Discord's response verbatim, so embeds, attachments and every other field
 * survive intact for a human to inspect. `runCli` pretty-prints whatever
 * this returns.
 */
@Injectable()
export class FetchRecentDiscordMessagesService {
  constructor(private readonly botToken: DiscordBotTokenService) {}

  async run(channelId: string, count: number): Promise<unknown> {
    // Runs before the token is even read: this is about `count` itself,
    // independent of any credential or connection.
    if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
      throw new Error(
        `count must be an integer between ${MIN_COUNT} and ${MAX_COUNT} ` +
          `(Discord's own limit for this endpoint), got ${String(count)}.`,
      );
    }
    if (!/^\d+$/.test(channelId)) {
      throw new Error(
        `channel id must be a Discord snowflake (digits only), got '${channelId}'.`,
      );
    }
    const token = await this.botToken.read();
    const response = await fetch(
      `${DISCORD_API_BASE_URL}/channels/${channelId}/messages?limit=${count}`,
      { headers: { Authorization: `Bot ${token}` } },
    );
    if (!response.ok) {
      // Discord's own error body is JSON text; pass it through as-is. It
      // never contains the token.
      throw new Error(
        `Discord API request for the ${count} most recent messages of ` +
          `channel ${channelId} failed with status ${response.status}: ` +
          `${await response.text()}`,
      );
    }
    return await response.json();
  }
}
