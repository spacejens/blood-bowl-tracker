import { serial, integer, varchar, unique } from 'drizzle-orm/pg-core';
import type {
  AnyPgColumn,
  AnyPgColumnBuilder,
  PgSchema,
} from 'drizzle-orm/pg-core';
import { externalSystems } from './external-systems';
import { historyTrackedTable } from './history';

export interface ExternalIdsTableOwner<TKey extends string> {
  /** camelCase TS property name for the owner FK column, e.g. 'coachId' */
  key: TKey;
  /** snake_case DB column name for the owner FK column, e.g. 'coach_id' */
  columnName: string;
  /** Reference to the owner table's id column, e.g. () => coaches.id */
  references: () => AnyPgColumn;
}

export function externalIdsTable<TKey extends string>(
  schema: PgSchema,
  tableName: string,
  owner: ExternalIdsTableOwner<TKey>,
) {
  const columns = {
    id: serial('id').primaryKey(),
    [owner.key]: integer(owner.columnName)
      .references(owner.references)
      .notNull(),
    externalSystemId: integer('external_system_id')
      .references(() => externalSystems.id)
      .notNull(),
    externalId: varchar('external_id', { length: 255 }).notNull(),
  } as Record<TKey, AnyPgColumnBuilder> & {
    id: AnyPgColumnBuilder;
    externalSystemId: AnyPgColumnBuilder;
    externalId: AnyPgColumnBuilder;
  };

  return historyTrackedTable(schema, tableName, columns, (t) => ({
    uniqueExternalId: unique(
      `${tableName}_external_system_id_external_id_unique`,
    ).on(t.externalSystemId, t.externalId),
  }));
}
