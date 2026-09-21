import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

const ENV_PRODUCTION_PATH = 'apps/discord-bot/.env.production';

/**
 * Reads the production Discord bot token from the gitignored
 * `apps/discord-bot/.env.production`, for the subcommands that call
 * Discord's REST API. Every error names the file, never the value — the
 * token is a credential that must not reach stdout, stderr, or a stack
 * trace.
 */
@Injectable()
export class DiscordBotTokenService {
  constructor(private readonly gitRoots: GitRootsService) {}

  async read(): Promise<string> {
    const roots = await this.gitRoots.resolve();
    const envPath = join(roots.worktreeRoot, ENV_PRODUCTION_PATH);
    if (!existsSync(envPath)) {
      throw new Error(
        `${ENV_PRODUCTION_PATH} not found. Sync it from the main checkout ` +
          'first (see deploy-production/SKILL.md).',
      );
    }
    const contents = readFileSync(envPath, 'utf8');
    const match = /^DISCORD_BOT_TOKEN=(.*)$/m.exec(contents);
    if (match === null) {
      throw new Error(`${ENV_PRODUCTION_PATH} does not set DISCORD_BOT_TOKEN.`);
    }
    // A dotenv-style value may carry a surrounding quote pair and/or a
    // trailing CRLF that a naive read would send straight to Discord.
    const value = match[1].replace(/^"|"$/g, '').replace(/\r$/, '');
    if (value === '') {
      throw new Error(
        `DISCORD_BOT_TOKEN is empty in ${ENV_PRODUCTION_PATH} — aborting ` +
          'without calling Discord.',
      );
    }
    return value;
  }
}
