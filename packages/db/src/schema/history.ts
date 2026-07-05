/**
 * drizzle-orm's generics for `PgSchema['table']` do not compose cleanly across the
 * dynamic column-shape derivation this helper performs (tracked columns are extended
 * at runtime, and the history table's shape is derived from a mix of the tracked
 * table's live config and a JSON snapshot). The `table`/`historyTable` values themselves
 * are now fully typed (no `any` leaks to callers); the narrow `any` usages that remain
 * below are confined to the internal `historyTable`'s extraConfig callback parameter,
 * which drizzle-orm itself types loosely for this construction pattern. See task-7 and
 * task-9 briefs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import {
  getTableConfig,
  integer,
  primaryKey,
  timestamp,
  type AnyPgColumnBuilder,
  type PgBuildExtraConfigColumns,
  type PgSchema,
  type PgTableExtraConfig,
} from 'drizzle-orm/pg-core';
import { deriveHistoryColumnShapes } from './history-column-shape';
import { readPreviousColumnShapes } from './history-snapshot';
import { rawColumn } from './raw-column';
import { tstzrange } from './tstzrange';

const migrationsDir = join(__dirname, '../../migrations');

const SPECIAL_COLUMN_NAMES = new Set([
  'id',
  'history_version',
  'history_period',
]);

export interface HistoryRegistryEntry {
  schemaName: string;
  tableName: string;
  historyTableName: string;
}

export const historyRegistry: HistoryRegistryEntry[] = [];

export function historyTrackedTable<
  TColumns extends Record<string, AnyPgColumnBuilder> & {
    id: AnyPgColumnBuilder;
  },
>(
  schema: PgSchema,
  name: string,
  columns: TColumns,
  extraConfig?: (
    self: PgBuildExtraConfigColumns<
      TColumns & {
        createdAt: AnyPgColumnBuilder;
        updatedAt: AnyPgColumnBuilder;
        historyVersion: AnyPgColumnBuilder;
        historyPeriod: AnyPgColumnBuilder;
      }
    >,
  ) => PgTableExtraConfig,
) {
  const trackedColumns = {
    ...columns,
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    historyVersion: integer('history_version').notNull().default(1),
    historyPeriod: tstzrange('history_period')
      .notNull()
      .default(sql`tstzrange(now(), null)`),
  };

  const table = extraConfig
    ? schema.table(name, trackedColumns, extraConfig)
    : schema.table(name, trackedColumns);

  const historyTableName = `${name}_history`;

  const currentMirrored = getTableConfig(table)
    .columns.filter((column) => !SPECIAL_COLUMN_NAMES.has(column.name))
    .map((column) => ({
      name: column.name,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
    }));

  const previousMirrored = readPreviousColumnShapes(
    migrationsDir,
    schema.schemaName,
    historyTableName,
  ).filter((column) => !SPECIAL_COLUMN_NAMES.has(column.name));

  const historyMirroredShapes = deriveHistoryColumnShapes(
    currentMirrored,
    previousMirrored,
  );

  const historyColumns: Record<string, AnyPgColumnBuilder> = {
    id: integer('id').references(() => table.id),
    ...Object.fromEntries(
      historyMirroredShapes.map((shape) => [
        shape.name,
        shape.notNull
          ? rawColumn(shape.name, { sqlType: shape.sqlType }).notNull()
          : rawColumn(shape.name, { sqlType: shape.sqlType }),
      ]),
    ),
    historyVersion: integer('history_version').notNull(),
    historyPeriod: tstzrange('history_period').notNull(),
  };

  const historyTable = schema.table(
    historyTableName,
    historyColumns,
    (t: any) => ({
      pk: primaryKey({ columns: [t.id, t.historyVersion] }),
    }),
  );

  historyRegistry.push({
    schemaName: schema.schemaName,
    tableName: name,
    historyTableName,
  });

  return { table, historyTable };
}
