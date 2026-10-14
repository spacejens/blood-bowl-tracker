import { Injectable } from '@nestjs/common';

import { PgClientService } from '../pg-client/pg-client.service';
import { TableRowCounts } from './backup-checks.service';
import { KEY_TABLES } from './key-tables';

/** Ceiling on one sanity-check query against the restored database. */
export const PSQL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Plain output: no psqlrc, no headers or footers, `|`-separated columns,
 * and a failing statement exits non-zero.
 */
const PSQL_FLAGS = [
  '--no-psqlrc',
  '--tuples-only',
  '--no-align',
  '--set=ON_ERROR_STOP=1',
] as const;

const ROW_COUNT_LINE = /^([a-z_]+)\|(\d+)$/;

/** The sanity-check queries run against a freshly restored backup. */
@Injectable()
export class RestoredDatabaseQueryService {
  constructor(private readonly pgClient: PgClientService) {}

  /** Migration names drizzle recorded as applied in the restored backup. */
  async appliedMigrations(databaseUrl: string): Promise<string[]> {
    const stdout = await this.query(
      databaseUrl,
      'SELECT name FROM drizzle.__drizzle_migrations WHERE name IS NOT NULL ORDER BY id;',
    );
    return this.lines(stdout);
  }

  /** Row count of every key table, keyed by bare table name. */
  async keyTableRowCounts(databaseUrl: string): Promise<TableRowCounts> {
    const sql =
      KEY_TABLES.map(
        (table) => `SELECT '${table}', count(*) FROM game_data.${table}`,
      ).join(' UNION ALL ') + ';';
    const counts: Record<string, number> = {};
    for (const line of this.lines(await this.query(databaseUrl, sql))) {
      const [, table, count] = ROW_COUNT_LINE.exec(line) ?? [];
      if (table === undefined || count === undefined) {
        throw new Error(`Unexpected psql output line: ${line}`);
      }
      counts[table] = Number(count);
    }
    return counts;
  }

  private query(databaseUrl: string, sql: string): Promise<string> {
    return this.pgClient.run({
      program: 'psql',
      args: [...PSQL_FLAGS, `--command=${sql}`],
      databaseUrl,
      timeoutMs: PSQL_TIMEOUT_MS,
    });
  }

  private lines(stdout: string): string[] {
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }
}
