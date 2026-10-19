import { Injectable } from '@nestjs/common';

import { DiscordRestService } from '../discord-rest/discord-rest.service';

/** Discord's own bounds on the `limit` query parameter for this endpoint. */
export const MIN_COUNT = 1;
export const MAX_COUNT = 100;

/**
 * Fetches the most recent messages of one Discord channel and returns
 * Discord's response verbatim, so embeds, attachments and every other field
 * survive intact for a human to inspect. `runCli` pretty-prints whatever
 * this returns.
 */
@Injectable()
export class FetchRecentDiscordMessagesService {
  constructor(private readonly discordRest: DiscordRestService) {}

  async run(channelId: string, count: number): Promise<unknown> {
    // Runs before the token is even read: this is about the input itself,
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
    return await this.discordRest.getRecentMessages(channelId, count);
  }
}
