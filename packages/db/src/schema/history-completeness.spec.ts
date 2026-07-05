import { describe, expect, it } from 'vitest';
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './index';
import { historyRegistry } from './history';

function isPgTable(value: unknown): value is PgTable {
  return is(value, PgTable);
}

describe('history tracking completeness', () => {
  const exportedTables = Object.values(schema).filter(isPgTable);

  it('every exported table is either tracked-with-history or is a *_history companion', () => {
    expect(exportedTables.length).toBeGreaterThan(0);

    for (const table of exportedTables) {
      const config = getTableConfig(table);
      const isHistoryCompanion = config.name.endsWith('_history');
      const isRegisteredTracked = historyRegistry.some(
        (entry) => entry.tableName === config.name,
      );
      const isRegisteredHistory = historyRegistry.some(
        (entry) => entry.historyTableName === config.name,
      );

      expect(
        isRegisteredTracked || (isHistoryCompanion && isRegisteredHistory),
        `Table "${config.name}" is exported from schema/index.ts but was not built via historyTrackedTable()`,
      ).toBe(true);
    }
  });

  it('every tracked table has created_at, updated_at, history_version and history_period', () => {
    for (const entry of historyRegistry) {
      const table = exportedTables.find((t) => getTableConfig(t).name === entry.tableName);
      expect(table, `tracked table "${entry.tableName}" not found among exports`).toBeDefined();
      const columnNames = getTableConfig(table!).columns.map((c) => c.name);
      expect(columnNames).toEqual(
        expect.arrayContaining([
          'created_at',
          'updated_at',
          'history_version',
          'history_period',
        ]),
      );
    }
  });

  it('every history companion table is named <table>_history', () => {
    for (const entry of historyRegistry) {
      expect(entry.historyTableName).toBe(`${entry.tableName}_history`);
    }
  });

  it('no non-history table uses the reserved _history suffix', () => {
    const trackedNames = new Set(historyRegistry.map((entry) => entry.tableName));
    for (const table of exportedTables) {
      const name = getTableConfig(table).name;
      if (name.endsWith('_history')) {
        const expectedTrackedName = name.slice(0, -'_history'.length);
        expect(
          trackedNames.has(expectedTrackedName),
          `Table "${name}" uses the reserved _history suffix but "${expectedTrackedName}" is not a tracked table`,
        ).toBe(true);
      }
    }
  });
});
