import { Injectable } from '@nestjs/common';

import { PgClientService } from '../pg-client/pg-client.service';
import {
  PSQL_FLAGS,
  PSQL_TIMEOUT_MS,
} from '../verify-backup/restored-database-query.service';

/**
 * Drops every non-system schema (everything but `pg_*` and
 * `information_schema`), then recreates an empty `public`.
 * Dropping whole schemas also removes tables a branch's newer
 * migrations added, which a restore of an older backup would otherwise leave
 * behind to block those migrations. One `DO` block is one statement, so the
 * wipe is atomic: it either fails without touching anything or clears
 * everything.
 */
export const WIPE_SQL = [
  'DO $$',
  'DECLARE target text;',
  'BEGIN',
  "  FOR target IN SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' LOOP",
  "    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', target);",
  '  END LOOP;',
  '  CREATE SCHEMA public;',
  'END $$;',
].join('\n');

/** Clears a local database so a backup can be restored into it. */
@Injectable()
export class LocalDatabaseWipeService {
  constructor(private readonly pgClient: PgClientService) {}

  async wipe(databaseUrl: string): Promise<void> {
    await this.pgClient.run({
      program: 'psql',
      args: [...PSQL_FLAGS, `--command=${WIPE_SQL}`],
      databaseUrl,
      timeoutMs: PSQL_TIMEOUT_MS,
    });
  }
}
