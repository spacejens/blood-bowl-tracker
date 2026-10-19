import { Injectable } from '@nestjs/common';

import { DiscordRestService } from '../discord-rest/discord-rest.service';

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
  constructor(private readonly discordRest: DiscordRestService) {}

  async run(messageLink: string): Promise<unknown> {
    // Runs before the token is even read: this is about the link itself,
    // independent of any credential or connection.
    const match = MESSAGE_LINK_PATTERN.exec(messageLink);
    if (match === null) {
      throw new Error(`${MESSAGE_LINK_USAGE}, got '${messageLink}'.`);
    }
    const [, , channelId, messageId] = match;
    return await this.discordRest.getMessage(channelId, messageId);
  }
}
