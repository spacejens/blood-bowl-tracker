import { describe, expect, it, beforeEach } from 'vitest';
import { getTableConfig, integer, pgSchema } from 'drizzle-orm/pg-core';
import { historyRegistry } from './history';
import { externalIdsTable } from './external-ids-table';

describe('externalIdsTable', () => {
  const testSchema = pgSchema('external_ids_test_schema');
  const ownerTable = testSchema.table('owners', {
    id: integer('id').primaryKey(),
  });

  beforeEach(() => {
    historyRegistry.length = 0;
  });

  it('builds a table with the owner FK, external system FK, and external ID columns', () => {
    const { table } = externalIdsTable(testSchema, 'owners_external_ids', {
      key: 'ownerId',
      columnName: 'owner_id',
      references: () => ownerTable.id,
    });

    const columnNames = getTableConfig(table).columns.map((c) => c.name);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        'id',
        'owner_id',
        'external_system_id',
        'external_id',
      ]),
    );

    const byName = Object.fromEntries(
      getTableConfig(table).columns.map((c) => [c.name, c]),
    );
    expect(byName.owner_id.notNull).toBe(true);
    expect(byName.external_system_id.notNull).toBe(true);
    expect(byName.external_id.notNull).toBe(true);
    expect(byName.external_id.getSQLType()).toBe('varchar(255)');
  });

  it('exposes the owner column under the given camelCase key at runtime', () => {
    const { table } = externalIdsTable(testSchema, 'owners_external_ids', {
      key: 'ownerId',
      columnName: 'owner_id',
      references: () => ownerTable.id,
    });

    expect((table as unknown as { ownerId: unknown }).ownerId).toBeDefined();
  });

  it('names the unique constraint from the table name and covers system+external id', () => {
    const { table } = externalIdsTable(testSchema, 'owners_external_ids', {
      key: 'ownerId',
      columnName: 'owner_id',
      references: () => ownerTable.id,
    });

    const config = getTableConfig(table);
    expect(config.uniqueConstraints).toHaveLength(1);
    const uniqueConstraint = config.uniqueConstraints[0];
    expect(uniqueConstraint.name).toBe(
      'owners_external_ids_external_system_id_external_id_unique',
    );
    expect(uniqueConstraint.columns.map((c) => c.name)).toEqual([
      'external_system_id',
      'external_id',
    ]);
  });

  it('is history-tracked: registers the table and names the history companion', () => {
    const { historyTable } = externalIdsTable(
      testSchema,
      'owners_external_ids',
      {
        key: 'ownerId',
        columnName: 'owner_id',
        references: () => ownerTable.id,
      },
    );

    expect(getTableConfig(historyTable).name).toBe(
      'owners_external_ids_history',
    );
    expect(historyRegistry).toEqual([
      {
        schemaName: 'external_ids_test_schema',
        tableName: 'owners_external_ids',
        historyTableName: 'owners_external_ids_history',
      },
    ]);
  });
});
