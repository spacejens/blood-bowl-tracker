import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

const ENV_PRODUCTION_PATH = 'apps/discord-bot/.env.production';

/**
 * Reads one variable's raw value out of the gitignored
 * `apps/discord-bot/.env.production`, shared by every production-ops-cli
 * subcommand that needs a production credential or connection string.
 * Every error names the file and the variable, never the value -- callers
 * apply their own value-shape validation (e.g. an empty-token check, a
 * postgres URL-shape check) after this returns.
 */
@Injectable()
export class ProductionEnvFileService {
  constructor(private readonly gitRoots: GitRootsService) {}

  async readValue(name: string): Promise<string> {
    const roots = await this.gitRoots.resolve();
    const envPath = join(roots.worktreeRoot, ENV_PRODUCTION_PATH);
    if (!existsSync(envPath)) {
      throw new Error(
        `${ENV_PRODUCTION_PATH} not found. Sync it from the main checkout ` +
          'first (see deploy-production/SKILL.md).',
      );
    }
    const contents = readFileSync(envPath, 'utf8');
    const match = new RegExp(`^${name}=(.*)$`, 'm').exec(contents);
    if (match === null) {
      throw new Error(`${ENV_PRODUCTION_PATH} does not set ${name}.`);
    }
    // A dotenv-style value may carry a trailing CRLF, and/or a surrounding
    // matched quote pair (double or single) that a naive read would pass
    // straight through. A value with an unbalanced quote (e.g. a stray
    // leading `"` with no matching close) is left as-is rather than
    // silently stripped.
    const stripped = match[1].replace(/\r$/, '');
    const unquoted = /^(["'])(.*)\1$/.exec(stripped);
    return unquoted ? unquoted[2] : stripped;
  }
}
