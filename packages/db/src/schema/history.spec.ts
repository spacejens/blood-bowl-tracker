import {
  getTableConfig,
  integer,
  pgSchema,
  varchar,
} from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { historyRegistry, historyTrackedTable } from './history';

describe('historyTrackedTable', () => {
  const testSchema = pgSchema('history_test_schema');

  beforeEach(() => {
    historyRegistry.length = 0;
  });

  it('appends created_at, updated_at, history_version and history_period to the tracked table', () => {
    const { table } = historyTrackedTable({
      schema: testSchema,
      name: 'widgets',
      columns: {
        id: integer('id').primaryKey(),
        name: varchar('name', { length: 255 }).notNull(),
      },
    });

    const columnNames = getTableConfig(table).columns.map((c) => c.name);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'created_at',
        'updated_at',
        'history_version',
        'history_period',
      ]),
    );

    const byName = Object.fromEntries(
      getTableConfig(table).columns.map((c) => [c.name, c]),
    );
    expect(byName.created_at.notNull).toBe(true);
    expect(byName.updated_at.notNull).toBe(true);
    expect(byName.history_version.notNull).toBe(true);
    expect(byName.history_version.getSQLType()).toBe('integer');
    expect(byName.history_period.notNull).toBe(true);
    expect(byName.history_period.getSQLType()).toBe('tstzrange');
  });

  it('names the companion history table with the reserved suffix', () => {
    const { historyTable } = historyTrackedTable({
      schema: testSchema,
      name: 'widgets',
      columns: {
        id: integer('id').primaryKey(),
        name: varchar('name', { length: 255 }).notNull(),
      },
    });
    expect(getTableConfig(historyTable).name).toBe('widgets_history');
  });

  it('mirrors tracked column nullability onto the history table (not uniformly nullable)', () => {
    const { historyTable } = historyTrackedTable({
      schema: testSchema,
      name: 'widgets',
      columns: {
        id: integer('id').primaryKey(),
        name: varchar('name', { length: 255 }).notNull(),
        nickname: varchar('nickname', { length: 100 }),
      },
    });
    const byName = Object.fromEntries(
      getTableConfig(historyTable).columns.map((c) => [c.name, c]),
    );
    expect(byName.name.notNull).toBe(true);
    expect(byName.nickname.notNull).toBe(false);
  });

  it('history table mirrors exactly the current tracked columns plus id/history bookkeeping', () => {
    const { historyTable } = historyTrackedTable({
      schema: testSchema,
      name: 'widgets',
      columns: {
        id: integer('id').primaryKey(),
        name: varchar('name', { length: 255 }).notNull(),
        nickname: varchar('nickname', { length: 100 }),
      },
    });
    const columnNames = getTableConfig(historyTable)
      .columns.map((c) => c.name)
      .sort();
    expect(columnNames).toEqual(
      [
        'created_at',
        'history_period',
        'history_version',
        'id',
        'name',
        'nickname',
        'updated_at',
      ].sort(),
    );
  });

  it('gives the history table an id column (FK, not primary key) and PK on (id, history_version)', () => {
    const { historyTable } = historyTrackedTable({
      schema: testSchema,
      name: 'widgets',
      columns: {
        id: integer('id').primaryKey(),
        name: varchar('name', { length: 255 }).notNull(),
      },
    });
    const config = getTableConfig(historyTable);
    expect(config.primaryKeys).toHaveLength(1);
    const pkColumnNames = config.primaryKeys[0].columns.map((c) => c.name);
    expect(pkColumnNames).toEqual(['id', 'history_version']);
  });

  it('registers the table in the history registry', () => {
    historyTrackedTable({
      schema: testSchema,
      name: 'widgets',
      columns: {
        id: integer('id').primaryKey(),
        name: varchar('name', { length: 255 }).notNull(),
      },
    });
    expect(historyRegistry).toEqual([
      {
        schemaName: 'history_test_schema',
        tableName: 'widgets',
        historyTableName: 'widgets_history',
      },
    ]);
  });
});
