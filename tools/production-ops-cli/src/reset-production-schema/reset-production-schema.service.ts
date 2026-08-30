import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GitRootsService,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

const ENV_PRODUCTION_PATH = 'apps/discord-bot/.env.production';

/**
 * DDL is near-instant; this only bounds a genuinely hung connection (e.g.
 * Neon's compute waking from autosuspend takes longer than expected).
 */
const PROCESS_TIMEOUT_MS = 30_000;

export interface ResetProductionSchemaResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Drops and recreates the production schemas for `deploy-production`'s "Drop
 * and recreate the production database" action, for the same reason
 * `RunProductionQueryService` exists: `DATABASE_URL` must never be read into
 * a value the controlling session can see, and `execFile` (not a shell)
 * removes any quoting risk from constructing the command.
 *
 * All three schemas matter, not just `public`: application tables live under
 * `game_data` (see `packages/db/src/schema/pg-schema.ts`), not `public` --
 * `public` only holds the shared `versioning()`/`set_updated_at()` trigger
 * functions the schema's history-tracking depends on. Dropping `public`
 * alone (a bug fixed here) removes those functions -- and, by cascade, the
 * triggers on `game_data` tables that call them -- without touching
 * `game_data` itself, leaving every table and all its data completely
 * intact. `drizzle` holds drizzle-orm's own migration journal
 * (`drizzle.__drizzle_migrations`, see `packages/db/src/db.ts`); leaving it
 * in place after dropping `game_data` would have the journal assert every
 * migration already ran against a database that no longer has any of their
 * effects, so the next startup's `migrate()` would rebuild nothing.
 *
 * `--single-transaction` wraps all four `-c` statements in one
 * `BEGIN`/`COMMIT`, so a later statement failing (with `ON_ERROR_STOP=1`
 * set) rolls back the earlier ones too, instead of leaving some schemas
 * dropped and others not.
 */
@Injectable()
export class ResetProductionSchemaService {
  constructor(
    private readonly gitRoots: GitRootsService,
    private readonly processRunner: ProcessRunnerService,
  ) {}

  async run(): Promise<ResetProductionSchemaResult> {
    const databaseUrl = await this.readDatabaseUrl();
    return this.processRunner.run(
      'psql',
      [
        databaseUrl,
        '--single-transaction',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'DROP SCHEMA IF EXISTS game_data CASCADE;',
        '-c',
        'DROP SCHEMA IF EXISTS public CASCADE;',
        '-c',
        'CREATE SCHEMA public;',
        '-c',
        'DROP SCHEMA IF EXISTS drizzle CASCADE;',
      ],
      PROCESS_TIMEOUT_MS,
    );
  }

  private async readDatabaseUrl(): Promise<string> {
    const roots = await this.gitRoots.resolve();
    const envPath = join(roots.worktreeRoot, ENV_PRODUCTION_PATH);
    if (!existsSync(envPath)) {
      throw new Error(
        `${ENV_PRODUCTION_PATH} not found. Sync it from the main checkout ` +
          'first (see deploy-production/SKILL.md).',
      );
    }
    const contents = readFileSync(envPath, 'utf8');
    const match = /^DATABASE_URL=(.*)$/m.exec(contents);
    if (match === null) {
      throw new Error(`${ENV_PRODUCTION_PATH} does not set DATABASE_URL.`);
    }
    // A dotenv-style value may carry a surrounding quote pair and/or a
    // trailing CRLF that a naive read would pass straight through to psql.
    const value = match[1].replace(/^"|"$/g, '').replace(/\r$/, '');
    if (!/^postgres(ql)?:\/\//.test(value)) {
      throw new Error(
        'DATABASE_URL is empty or malformed after extraction from ' +
          `${ENV_PRODUCTION_PATH} — aborting without connecting.`,
      );
    }
    return value;
  }
}
