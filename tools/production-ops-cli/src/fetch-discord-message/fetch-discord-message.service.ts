import { Injectable } from '@nestjs/common';

import { DiscordBotTokenService } from '../discord-bot-token/discord-bot-token.service';

/** Matches the API version `packages/discord-client` already pins. */
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

/**
 * The guild id is captured only to pin the link's shape — the REST call
 * addresses a message by channel and message id alone. Accepts the stable
 * domain plus the `canary.`/`ptb.` pre-release clients and the legacy
 * `discordapp.com` domain, since a message link copied from any of those
 * clients points at the same message.
 */
const MESSAGE_LINK_PATTERN =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/;

const MESSAGE_LINK_USAGE =
  'Message link must look like ' +
  'https://discord.com/channels/<guild-id>/<channel-id>/<message-id>';

/**
 * Fetches one Discord message by its message link and returns Discord's
 * response verbatim, so embeds, attachments and every other field survive
 * intact for a human to inspect. `runCli` pretty-prints whatever this
 * returns.
 */
@Injectable()
export class FetchDiscordMessageService {
  constructor(private readonly botToken: DiscordBotTokenService) {}

  async run(messageLink: string): Promise<unknown> {
    // Runs before the token is even read: this is about the link itself,
    // independent of any credential or connection.
    const match = MESSAGE_LINK_PATTERN.exec(messageLink);
    if (match === null) {
      throw new Error(`${MESSAGE_LINK_USAGE}, got '${messageLink}'.`);
    }
    const [, , channelId, messageId] = match;
    const token = await this.botToken.read();
    const response = await fetch(
      `${DISCORD_API_BASE_URL}/channels/${channelId}/messages/${messageId}`,
      { headers: { Authorization: `Bot ${token}` } },
    );
    if (!response.ok) {
      // Discord's own error body is JSON text; pass it through as-is. It
      // never contains the token.
      throw new Error(
        `Discord API request for message ${messageId} in channel ` +
          `${channelId} failed with status ${response.status}: ` +
          `${await response.text()}`,
      );
    }
    return await response.json();
  }
}
