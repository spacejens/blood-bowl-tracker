import { Injectable } from '@nestjs/common';

import { ProductionEnvFileService } from '../production-env-file/production-env-file.service';

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
  constructor(private readonly productionEnvFile: ProductionEnvFileService) {}

  async read(): Promise<string> {
    const value = await this.productionEnvFile.readValue('DISCORD_BOT_TOKEN');
    if (value === '') {
      throw new Error(
        `DISCORD_BOT_TOKEN is empty in ${ENV_PRODUCTION_PATH} — aborting ` +
          'without calling Discord.',
      );
    }
    return value;
  }
}
