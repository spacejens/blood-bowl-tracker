import { Injectable } from '@nestjs/common';

import { PgClientService } from '../pg-client/pg-client.service';
import { PG_RESTORE_TIMEOUT_MS } from '../restore/pg-restore.service';
import { APPLICATION_SCHEMAS } from './application-schemas';

/**
 * Drops every application schema, including tables newer migrations added
 * that the backup lacks, and recreates an empty `public` for the restore
 * script to fill.
 */
export const PRODUCTION_WIPE_SQL = [
  ...APPLICATION_SCHEMAS.map(
    (schema) => `DROP SCHEMA IF EXISTS ${schema} CASCADE;`,
  ),
  'CREATE SCHEMA public;',
].join('\n');

export interface ProductionRestoreRequest {
  /** A `pg_restore --file` script of the whole backup. */
  readonly scriptPath: string;
  readonly databaseUrl: string;
}

/**
 * Replaces production's application schemas with a backup in one
 * transaction: `--single-transaction` wraps the wipe and the whole restore
 * script in one `BEGIN`/`COMMIT`, and `ON_ERROR_STOP` makes any failing
 * statement roll all of it back, so production ends up either fully restored
 * or exactly as it was. A timeout kills `psql` before `COMMIT`, which also
 * rolls back. Success is judged by the exit code alone: `psql` still prints
 * notices and result tables from the script on a successful run.
 */
@Injectable()
export class ProductionRestoreService {
  constructor(private readonly pgClient: PgClientService) {}

  async restore(request: ProductionRestoreRequest): Promise<void> {
    await this.pgClient.run({
      program: 'psql',
      args: [
        '--no-psqlrc',
        '--quiet',
        '--set=ON_ERROR_STOP=1',
        '--single-transaction',
        `--command=${PRODUCTION_WIPE_SQL}`,
        `--file=${request.scriptPath}`,
      ],
      databaseUrl: request.databaseUrl,
      timeoutMs: PG_RESTORE_TIMEOUT_MS,
    });
  }
}
