import { existsSync, statSync } from 'node:fs';

import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import { DatabaseUrlRedactorService } from '../pg-client/database-url-redactor.service';

/** A hard ceiling on one dump; far above what this database needs today. */
export const PG_DUMP_TIMEOUT_MS = 30 * 60 * 1000;

export interface PgDumpRequest {
  readonly databaseUrl: string;
  readonly outputPath: string;
}

/**
 * Dumps the whole database (every schema) to a local file with `pg_dump`,
 * in custom format so a restore can be selective. `--no-owner` is passed
 * for completeness but only affects plain-text dumps; an archive keeps its
 * ownership entries, so a restore into a database with different roles must
 * pass `--no-owner` to `pg_restore`. pg_dump writes the file itself
 * (`--file`), so the dump never passes through `ProcessRunnerService`'s
 * in-memory stdout buffer.
 */
@Injectable()
export class PgDumpService {
  constructor(
    private readonly processRunner: ProcessRunnerService,
    private readonly redactor: DatabaseUrlRedactorService,
  ) {}

  async dump(request: PgDumpRequest): Promise<number> {
    let result;
    try {
      result = await this.processRunner.run(
        'pg_dump',
        [
          '--format=custom',
          '--no-owner',
          '--no-password',
          `--file=${request.outputPath}`,
          `--dbname=${request.databaseUrl}`,
        ],
        PG_DUMP_TIMEOUT_MS,
      );
    } catch (error) {
      // The runner rejects with the raw execFile error (e.g. when pg_dump is
      // killed by a signal); its message embeds the full command line. The
      // original error is deliberately not chained as `cause`.
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
        `pg_dump timed out after ${PG_DUMP_TIMEOUT_MS / 60_000} minutes.`,
      );
    }
    if (result.exitCode !== 0) {
      // pg_dump can echo the connection string, password included.
      const stderr = this.redactor
        .redact(result.stderr, request.databaseUrl)
        .trim();
      throw new Error(`pg_dump exited with code ${result.exitCode}: ${stderr}`);
    }
    const size = existsSync(request.outputPath)
      ? statSync(request.outputPath).size
      : 0;
    if (size === 0) {
      throw new Error(
        'pg_dump exited successfully but produced an empty dump.',
      );
    }
    return size;
  }
}
