import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { historyRegistry } from './history';
import * as schema from './index';

function isPgTable(value: unknown): value is PgTable {
  return is(value, PgTable);
}

describe('history tracking completeness', () => {
  const exportedTables = (Object.values(schema) as unknown[]).filter(isPgTable);

  /**
   * History tracking is a `game_data` invariant, not a repo-wide one. The
   * `discord_bot_usage` schema holds operational bot telemetry whose enrichable
   * fields (guild/channel names, usernames, nicknames) are deliberately
   * overwritten in place rather than versioned, so its tables are excluded from
   * the "everything is tracked" check below. They are still covered by the
   * reserved-suffix check, which applies to every exported table.
   */
  const gameDataTables = exportedTables.filter(
    (table) => getTableConfig(table).schema === 'game_data',
  );

  it('every exported table is either tracked-with-history or is a *_history companion', () => {
    expect(gameDataTables.length).toBeGreaterThan(0);

    for (const table of gameDataTables) {
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
      const table = gameDataTables.find(
        (t) => getTableConfig(t).name === entry.tableName,
      );
      expect(
        table,
        `tracked table "${entry.tableName}" not found among exports`,
      ).toBeDefined();
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
    const trackedNames = new Set(
      historyRegistry.map((entry) => entry.tableName),
    );
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
