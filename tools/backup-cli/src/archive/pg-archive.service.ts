import { readFileSync } from 'node:fs';

import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import { PG_RESTORE_TIMEOUT_MS } from '../restore/pg-restore.service';
import { KEY_TABLES } from '../verify-backup/key-tables';

export interface ArchiveScriptRequest {
  readonly dumpPath: string;
  /** Where pg_restore writes the script; inside the run's temporary directory. */
  readonly outputPath: string;
}

/**
 * Runs `pg_restore` against a downloaded archive without connecting to any
 * database: listing its contents, or turning it into a SQL script. No
 * connection string is involved, so nothing here needs redacting.
 */
@Injectable()
export class PgArchiveService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  /** The archive's table of contents (`pg_restore --list`). */
  listContents(dumpPath: string): Promise<string> {
    return this.pgRestore(['--list', dumpPath]);
  }

  /**
   * A data-only script of drizzle's migration journal and the key tables,
   * written to `outputPath` (it can be larger than a child's stdout buffer)
   * and returned as text.
   */
  async extractData(request: ArchiveScriptRequest): Promise<string> {
    await this.pgRestore([
      '--data-only',
      '--schema=drizzle',
      '--schema=game_data',
      '--table=__drizzle_migrations',
      ...KEY_TABLES.map((table) => `--table=${table}`),
      `--file=${request.outputPath}`,
      request.dumpPath,
    ]);
    return readFileSync(request.outputPath, 'utf8');
  }

  /**
   * The whole archive as a SQL script, without production's ownership and
   * grant entries, for `psql` to run inside one transaction.
   */
  async writeRestoreScript(request: ArchiveScriptRequest): Promise<void> {
    await this.pgRestore([
      '--no-owner',
      '--no-privileges',
      `--file=${request.outputPath}`,
      request.dumpPath,
    ]);
  }

  private async pgRestore(args: readonly string[]): Promise<string> {
    const result = await this.processRunner.run(
      'pg_restore',
      args,
      PG_RESTORE_TIMEOUT_MS,
    );
    if (result.exitCode === TIMED_OUT_EXIT_CODE) {
      throw new Error(
        `pg_restore timed out after ${PG_RESTORE_TIMEOUT_MS / 60_000} minutes reading the backup.`,
      );
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `pg_restore could not read the backup (exit code ${result.exitCode}): ` +
          result.stderr.trim(),
      );
    }
    return result.stdout;
  }
}
