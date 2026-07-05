import { describe, expect, it, beforeEach } from 'vitest';
import {
  getTableConfig,
  integer,
  pgSchema,
  varchar,
} from 'drizzle-orm/pg-core';
import { historyRegistry, historyTrackedTable } from './history';

describe('historyTrackedTable', () => {
  const testSchema = pgSchema('history_test_schema');

  beforeEach(() => {
    historyRegistry.length = 0;
  });

  it('appends created_at, updated_at, history_version and history_period to the tracked table', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- historyTrackedTable's return is intentionally widened, see history.ts
    const { table } = historyTrackedTable(testSchema, 'widgets', {
      id: integer('id').primaryKey(),
      name: varchar('name', { length: 255 }).notNull(),
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
    const { historyTable } = historyTrackedTable(testSchema, 'widgets', {
      id: integer('id').primaryKey(),
      name: varchar('name', { length: 255 }).notNull(),
    });
    expect(getTableConfig(historyTable).name).toBe('widgets_history');
  });

  it('mirrors tracked column nullability onto the history table (not uniformly nullable)', () => {
    const { historyTable } = historyTrackedTable(testSchema, 'widgets', {
      id: integer('id').primaryKey(),
      name: varchar('name', { length: 255 }).notNull(),
      nickname: varchar('nickname', { length: 100 }),
    });
    const byName = Object.fromEntries(
      getTableConfig(historyTable).columns.map((c) => [c.name, c]),
    );
    expect(byName.name.notNull).toBe(true);
    expect(byName.nickname.notNull).toBe(false);
  });

  it('gives the history table an id column (FK, not primary key) and PK on (id, history_version)', () => {
    const { historyTable } = historyTrackedTable(testSchema, 'widgets', {
      id: integer('id').primaryKey(),
      name: varchar('name', { length: 255 }).notNull(),
    });
    const config = getTableConfig(historyTable);
    expect(config.primaryKeys).toHaveLength(1);
    const pkColumnNames = config.primaryKeys[0].columns.map((c) => c.name);
    expect(pkColumnNames).toEqual(['id', 'history_version']);
  });

  it('registers the table in the history registry', () => {
    historyTrackedTable(testSchema, 'widgets', {
      id: integer('id').primaryKey(),
      name: varchar('name', { length: 255 }).notNull(),
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
