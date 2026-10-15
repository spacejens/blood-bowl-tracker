import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

/** The gitignored file holding production's secrets, relative to the checkout root. */
export const ENV_PRODUCTION_PATH = 'apps/discord-bot/.env.production';

/**
 * Production's connection string for `restore-production`, read from the
 * checkout's `apps/discord-bot/.env.production` rather than taken as an
 * argument or setting, so it never passes through a command line or the
 * controlling session. Errors name the file and the variable, never the
 * value. A dotenv-style trailing CR and a matched surrounding quote pair are
 * stripped; an unbalanced quote is left in place and then fails the scheme
 * check.
 */
@Injectable()
export class ProductionDatabaseUrlService {
  constructor(private readonly gitRoots: GitRootsService) {}

  async read(): Promise<string> {
    const { worktreeRoot } = await this.gitRoots.resolve();
    const envPath = join(worktreeRoot, ENV_PRODUCTION_PATH);
    if (!existsSync(envPath)) {
      throw new Error(
        `${ENV_PRODUCTION_PATH} not found. Run restore-production from the ` +
          'main checkout, where that file lives.',
      );
    }
    const match = /^DATABASE_URL=(.*)$/m.exec(readFileSync(envPath, 'utf8'));
    if (match === null) {
      throw new Error(`${ENV_PRODUCTION_PATH} does not set DATABASE_URL.`);
    }
    const stripped = match[1].replace(/\r$/, '');
    const unquoted = /^(["'])(.*)\1$/.exec(stripped);
    const value = unquoted ? unquoted[2] : stripped;
    if (!/^postgres(ql)?:\/\//.test(value)) {
      throw new Error(
        `DATABASE_URL in ${ENV_PRODUCTION_PATH} is empty or not a ` +
          'postgres:// or postgresql:// connection string; aborting without connecting.',
      );
    }
    return value;
  }
}
