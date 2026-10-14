import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import { DatabaseUrlRedactorService } from './database-url-redactor.service';

/**
 * libpq variables that can send a connection somewhere other than the
 * `--dbname` URL the local-database guard checked.
 */
const REDIRECTING_ENV_VARS = [
  'PGHOSTADDR',
  'PGHOST',
  'PGSERVICE',
  'PGSERVICEFILE',
] as const;

export type PgClientProgram = 'pg_restore' | 'psql';

export interface PgClientRequest {
  readonly program: PgClientProgram;
  /** Every argument except the connection, which is always `--dbname`. */
  readonly args: readonly string[];
  readonly databaseUrl: string;
  readonly timeoutMs: number;
}

/**
 * Runs a PostgreSQL client program against one database and returns its
 * stdout. A non-zero exit, a timeout, or a failure to run at all throws, and
 * the connection string (which these programs can echo, password included)
 * is redacted from every error.
 */
@Injectable()
export class PgClientService {
  constructor(
    private readonly processRunner: ProcessRunnerService,
    private readonly redactor: DatabaseUrlRedactorService,
  ) {}

  async run(request: PgClientRequest): Promise<string> {
    let result;
    try {
      result = await this.processRunner.runWithOptions(
        request.program,
        [`--dbname=${request.databaseUrl}`, ...request.args],
        { timeoutMs: request.timeoutMs, env: this.childEnv() },
      );
    } catch (error) {
      // The runner rejects with the raw execFile error, whose message embeds
      // the full command line. The original error is deliberately not
      // chained as `cause`.
      // eslint-disable-next-line preserve-caught-error -- the cause would carry the secret
      throw new Error(
        this.redactor.redact(
          error instanceof Error ? error.message : String(error),
          request.databaseUrl,
        ),
      );
    }
    if (result.exitCode === TIMED_OUT_EXIT_CODE) {
      throw new Error(
        `${request.program} timed out after ${request.timeoutMs / 60_000} minutes.`,
      );
    }
    if (result.exitCode !== 0) {
      const stderr = this.redactor
        .redact(result.stderr, request.databaseUrl)
        .trim();
      throw new Error(
        `${request.program} exited with code ${result.exitCode}: ${stderr}`,
      );
    }
    return result.stdout;
  }

  private childEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const name of REDIRECTING_ENV_VARS) {
      delete env[name];
    }
    return env;
  }
}
