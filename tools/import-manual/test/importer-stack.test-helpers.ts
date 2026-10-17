/// <reference types="node" />
import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT, ApiClientModule } from '@blood-bowl-tracker/api-client';
import { ApiServerModule } from '@blood-bowl-tracker/api-server';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, DbModule, sql } from '@blood-bowl-tracker/db';
import { closeTestDb } from '@blood-bowl-tracker/db/test-helpers';
import type { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ManualImportModule } from '../src/import/manual-import.module';
import { ManualImportService } from '../src/import/manual-import.service';

/** The bearer token the in-process api-server accepts from this suite. */
const E2E_API_TOKEN = 'import-manual-e2e-token';

/** A real api-server over HTTP, the real manual importer and a client. */
export interface ImporterStack {
  server: INestApplication;
  importers: TestingModule;
  db: Db;
  client: ApiClient;
  manual: ManualImportService;
}

/**
 * Serves the real ApiServerModule on an ephemeral port against `databaseUrl`
 * and builds the real ManualImportModule against it through
 * ApiClientModule, so every call goes through the same client, RPC router
 * and contract as a production import.
 */
export async function startImporterStack(
  databaseUrl: string,
): Promise<ImporterStack> {
  // ApiTokenAuthService reads the importer tokens from the environment.
  process.env.API_TOKEN_IMPORT_MANUAL = E2E_API_TOKEN;
  const serverModule = await Test.createTestingModule({
    imports: [
      DbModule.forRootAsync({ useFactory: () => databaseUrl }),
      ApiServerModule,
    ],
  }).compile();
  const server = serverModule.createNestApplication(new ExpressAdapter(), {
    logger: false,
  });
  await server.listen(0, '127.0.0.1');
  const importers = await Test.createTestingModule({
    imports: [
      ApiClientModule.forRoot({
        baseUrl: await server.getUrl(),
        apiToken: E2E_API_TOKEN,
      }),
      ManualImportModule,
    ],
  }).compile();
  return {
    server,
    importers,
    db: serverModule.get<Db>(DB),
    client: importers.get<ApiClient>(API_CLIENT),
    manual: importers.get(ManualImportService),
  };
}

/** Closes the importers, the server and the server's database connection. */
export async function stopImporterStack(stack: ImporterStack): Promise<void> {
  await stack.importers.close();
  await stack.server.close();
  await closeTestDb(stack.db);
}

/**
 * Every game_data table, current and history, as each row's full JSON, sorted
 * so row order does not matter. Timestamps are included on purpose: an
 * unchanged re-run must not touch them either.
 */
export async function snapshotGameData(
  db: Db,
): Promise<Record<string, string[]>> {
  const tables = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables
        where table_schema = 'game_data' and table_type = 'BASE TABLE'
        order by table_name`,
  );
  const snapshot: Record<string, string[]> = {};
  for (const { table_name: table } of tables) {
    const rows = await db.execute<{ row: string }>(
      sql`select to_jsonb(t)::text as row from ${sql.identifier('game_data')}.${sql.identifier(table)} t`,
    );
    snapshot[table] = rows.map((r) => r.row).sort();
  }
  return snapshot;
}

/** Row count of every `*_history` table, for a readable first assertion. */
export function historyCounts(
  snapshot: Record<string, string[]>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(snapshot)
      .filter(([table]) => table.endsWith('_history'))
      .map(([table, rows]) => [table, rows.length]),
  );
}
