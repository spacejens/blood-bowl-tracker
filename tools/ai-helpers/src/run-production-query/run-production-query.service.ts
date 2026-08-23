import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { GitRootsService } from '../shared/git-roots.service';
import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '../shared/process-runner.service';

const ENV_PRODUCTION_PATH = 'apps/discord-bot/.env.production';

/**
 * `SET LOCAL` (not plain `SET`) scopes this to the one transaction the query
 * runs in, rather than leaning on a session-wide setting the query's own
 * text could also reset for itself.
 */
const STATEMENT_TIMEOUT_SQL = "SET LOCAL statement_timeout = '30s';";

/**
 * 5 seconds past the SQL-level timeout, so a normal slow query reports
 * Postgres's own timeout error first. Unlike `STATEMENT_TIMEOUT_SQL`,
 * nothing the query's own text can do (e.g. opening with its own
 * `SET LOCAL statement_timeout = 0;`) prevents this from firing -- it is a
 * real OS-level deadline on the `psql` client process itself, killed via
 * `SIGTERM`/`SIGKILL`. That guarantees this command always terminates and
 * reports `timedOut`; it is not a guarantee that the server-side statement
 * stops running. Postgres only notices the client disconnected the next
 * time it tries to communicate with it, so a CPU/IO-bound statement the
 * query text deliberately kept unbounded may continue consuming production
 * compute until it finishes or hits a server-side limit of its own.
 */
const PROCESS_TIMEOUT_MS = 35_000;

export interface RunProductionQueryResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** True when `PROCESS_TIMEOUT_MS` killed the query, not an ordinary exit. */
  readonly timedOut: boolean;
}

/**
 * Runs one developer-described, read-only query against production, for
 * `deploy-production`'s "Run read-only queries against production" action.
 * `ProcessRunnerService` spawns `psql` via `execFile`, not a shell, so the
 * query travels as a single argv entry — no shell quoting of embedded
 * quotes, heredocs, or delimiter-collision risk, unlike a hand-written shell
 * invocation of the same command.
 */
@Injectable()
export class RunProductionQueryService {
  constructor(
    private readonly gitRoots: GitRootsService,
    private readonly processRunner: ProcessRunnerService,
  ) {}

  async run(query: string): Promise<RunProductionQueryResult> {
    this.validateQuery(query);
    const databaseUrl = await this.readDatabaseUrl();
    const result = await this.processRunner.run(
      'psql',
      [
        databaseUrl,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'BEGIN TRANSACTION READ ONLY;',
        '-c',
        STATEMENT_TIMEOUT_SQL,
        '-c',
        query,
        '-c',
        'COMMIT;',
      ],
      PROCESS_TIMEOUT_MS,
    );
    return { ...result, timedOut: result.exitCode === TIMED_OUT_EXIT_CODE };
  }

  /**
   * Runs before anything else -- before credentials are even read, let alone
   * `psql` spawned -- since both checks here are about what `query` itself
   * could do, independent of the connection.
   */
  private validateQuery(query: string): void {
    const trimmed = query.trim();
    if (trimmed === '') {
      throw new Error(
        'Query text is empty -- nothing to run. Pass the SQL to run on stdin.',
      );
    }
    // psql's `-c` accepts either a SQL command or a single backslash
    // meta-command, and `execFile` (unlike a shell) never gets a chance to
    // reject this: `\!` in particular shells out to the LOCAL machine
    // running this command, entirely outside the database and its read-only
    // transaction -- not a SQL injection, but arbitrary local code
    // execution. Reject any query that could be interpreted as one before
    // it ever reaches `psql`.
    if (trimmed.startsWith('\\')) {
      throw new Error(
        'Query text looks like a psql meta-command (starts with "\\"), ' +
          'which this action refuses to run -- meta-commands like \\! run ' +
          'locally, outside the database and its read-only transaction. ' +
          'Pass plain SQL instead.',
      );
    }
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
