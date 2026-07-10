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

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumnBuilder,
  getTableConfig,
  integer,
  type PgBuildExtraConfigColumns,
  type PgColumn,
  type PgSchema,
  type PgTableExtraConfig,
  primaryKey,
  timestamp,
} from 'drizzle-orm/pg-core';

import { rawColumn } from './raw-column';
import { tstzrange } from './tstzrange';

const SPECIAL_COLUMN_NAMES = new Set([
  'id',
  'history_version',
  'history_period',
]);

/**
 * `column.getSQLType()` returns the bare type name for schema-scoped enums (e.g.
 * `competition_type`) without the schema qualifier drizzle-orm applies when it compiles
 * the original CREATE TABLE statement. Our history columns are built via `rawColumn`,
 * which emits `sqlType` verbatim, so an unqualified enum name here would fail to
 * resolve at migration time if `search_path` doesn't include the table's schema. Qualify
 * it explicitly using the enum's own schema when present.
 */
function qualifiedSqlType(
  column: PgColumn & { enum?: { schema?: string } },
): string {
  const sqlType = column.getSQLType();
  const enumSchema = column.enum?.schema;
  return enumSchema ? `"${enumSchema}"."${sqlType}"` : sqlType;
}

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

  // Two inference pitfalls, both worked around here:
  // 1. A ternary (schema.table(name, trackedColumns, extraConfig) : schema.table(name,
  //    trackedColumns)) makes TypeScript infer `table`'s declared type as a union across
  //    both branches, so we always call the extraConfig-required overload (with a no-op
  //    default) instead of branching.
  // 2. Our own `extraConfig` parameter's declared type references
  //    `PgBuildExtraConfigColumns<TColumns & { ...injected columns... }>` for its callback
  //    parameter. That reference becomes a second, competing inference site for
  //    `schema.table`'s own `TColumnsMap`
  //    type parameter, and TypeScript resolves it to `TColumns` (the caller's original
  //    columns) rather than `typeof trackedColumns` (which also has the four injected
  //    columns) — silently dropping created_at/updated_at/history_version/history_period
  //    from the inferred table type. Passing the type arguments explicitly pins
  //    `TColumnsMap` to `typeof trackedColumns` and eliminates the ambiguity.
  const table = schema.table<string, typeof trackedColumns>(
    name,
    trackedColumns,
    extraConfig ?? (() => ({})),
  );

  const historyTableName = `${name}_history`;

  const historyMirroredShapes = getTableConfig(table)
    .columns.filter((column) => !SPECIAL_COLUMN_NAMES.has(column.name))
    .map((column) => ({
      name: column.name,
      sqlType: qualifiedSqlType(column),
      notNull: column.notNull,
    }));

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
