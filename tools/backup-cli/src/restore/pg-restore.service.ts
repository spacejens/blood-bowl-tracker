import { Injectable } from '@nestjs/common';

import { PgClientService } from '../pg-client/pg-client.service';

/** A hard ceiling on one restore, matching the ceiling on one dump. */
export const PG_RESTORE_TIMEOUT_MS = 30 * 60 * 1000;

export interface PgRestoreRequest {
  readonly dumpPath: string;
  readonly databaseUrl: string;
}

/**
 * Restores a custom-format `pg_dump` archive into an empty database. The
 * archive keeps production's ownership and grant entries, whose roles do not
 * exist in a throwaway database, so both are skipped (`--no-owner`,
 * `--no-privileges`); anything else that fails stops the restore
 * (`--exit-on-error`), so a partial restore can never pass as a good one.
 */
@Injectable()
export class PgRestoreService {
  constructor(private readonly pgClient: PgClientService) {}

  async restore(request: PgRestoreRequest): Promise<void> {
    await this.pgClient.run({
      program: 'pg_restore',
      args: [
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--single-transaction',
        '--no-password',
        request.dumpPath,
      ],
      databaseUrl: request.databaseUrl,
      timeoutMs: PG_RESTORE_TIMEOUT_MS,
    });
  }
}
