import { existsSync, statSync } from 'node:fs';

import { PgClientService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

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
 * (`--file`), so the dump never passes through the process runner's
 * in-memory stdout buffer.
 */
@Injectable()
export class PgDumpService {
  constructor(private readonly pgClient: PgClientService) {}

  async dump(request: PgDumpRequest): Promise<number> {
    await this.pgClient.run({
      program: 'pg_dump',
      args: [
        '--format=custom',
        '--no-owner',
        '--no-password',
        `--file=${request.outputPath}`,
      ],
      databaseUrl: request.databaseUrl,
      timeoutMs: PG_DUMP_TIMEOUT_MS,
    });
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
