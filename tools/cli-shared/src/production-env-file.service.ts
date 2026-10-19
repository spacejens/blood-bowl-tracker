import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import { parse } from 'dotenv';

import { GitRootsService } from './git-roots.service';
import { ENV_PRODUCTION_PATH } from './gitignored-files';

/**
 * Production's secrets for the CLI packages, read from the gitignored
 * `apps/discord-bot/.env.production` of the checkout this process runs in,
 * so they never pass through a command line or the controlling session.
 * Parsed with dotenv, the parser `@nestjs/config` gives the bot itself, so
 * a CLI reads the same value the app does. Every error names the file and
 * the variable, never the value.
 */
@Injectable()
export class ProductionEnvFileService {
  constructor(private readonly gitRoots: GitRootsService) {}

  async readValue(name: string): Promise<string> {
    const { worktreeRoot } = await this.gitRoots.resolve();
    const envPath = join(worktreeRoot, ENV_PRODUCTION_PATH);
    if (!existsSync(envPath)) {
      throw new Error(
        `${ENV_PRODUCTION_PATH} not found in this checkout. It is gitignored ` +
          'and lives in the main checkout: run from there, or copy it into ' +
          'this worktree first (see .claude/skills/deploy-production/SKILL.md).',
      );
    }
    const values = parse(readFileSync(envPath, 'utf8'));
    if (!Object.hasOwn(values, name)) {
      throw new Error(`${ENV_PRODUCTION_PATH} does not set ${name}.`);
    }
    return values[name];
  }

  /**
   * Production's connection string, refused unless it is a `postgres://` or
   * `postgresql://` URL. This is the one place that check lives.
   */
  async readDatabaseUrl(): Promise<string> {
    const value = await this.readValue('DATABASE_URL');
    if (!/^postgres(ql)?:\/\//.test(value)) {
      throw new Error(
        `DATABASE_URL in ${ENV_PRODUCTION_PATH} is empty or not a ` +
          'postgres:// or postgresql:// connection string; aborting without connecting.',
      );
    }
    return value;
  }
}
