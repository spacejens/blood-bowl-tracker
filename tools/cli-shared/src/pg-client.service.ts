import { Injectable } from '@nestjs/common';

import { DatabaseUrlRedactorService } from './database-url-redactor.service';
import {
  ProcessResult,
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from './process-runner.service';

/**
 * libpq variables that can send a connection somewhere other than the
 * `--dbname` URL the caller passed (and, in backup-cli, the local-database
 * guard checked).
 */
const REDIRECTING_ENV_VARS = [
  'PGHOSTADDR',
  'PGHOST',
  'PGSERVICE',
  'PGSERVICEFILE',
] as const;

type PgClientProgram = 'pg_restore' | 'psql';

export interface PgClientRequest {
  readonly program: PgClientProgram;
  /** Every argument except the connection, which is always `--dbname`. */
  readonly args: readonly string[];
  readonly databaseUrl: string;
  readonly timeoutMs: number;
}

/** One finished run, with the connection string redacted from its output. */
export interface PgClientResult extends ProcessResult {
  /** True when `timeoutMs` killed the program; `exitCode` is then `TIMED_OUT_EXIT_CODE`. */
  readonly timedOut: boolean;
}

/**
 * Runs a PostgreSQL client program against one database, with the libpq
 * variables that could redirect the connection removed from its environment
 * and the URL passed as `--dbname`. The connection string (which these
 * programs can echo, password included) is redacted from all output and
 * every error.
 */
@Injectable()
export class PgClientService {
  constructor(
    private readonly processRunner: ProcessRunnerService,
    private readonly redactor: DatabaseUrlRedactorService,
  ) {}

  /**
   * Resolves for any exit, including a non-zero one or a kill by
   * `timeoutMs`, so the caller decides what a failure means. Rejects only
   * when the program could not be run at all.
   */
  async runToResult(request: PgClientRequest): Promise<PgClientResult> {
    let result: ProcessResult;
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
    return {
      exitCode: result.exitCode,
      stdout: this.redactor.redact(result.stdout, request.databaseUrl),
      stderr: this.redactor.redact(result.stderr, request.databaseUrl),
      timedOut: result.exitCode === TIMED_OUT_EXIT_CODE,
    };
  }

  /** Returns stdout; a timeout, a non-zero exit, or a failure to run throws. */
  async run(request: PgClientRequest): Promise<string> {
    const result = await this.runToResult(request);
    if (result.timedOut) {
      throw new Error(
        `${request.program} timed out after ${request.timeoutMs / 60_000} minutes.`,
      );
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `${request.program} exited with code ${result.exitCode}: ${result.stderr.trim()}`,
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
