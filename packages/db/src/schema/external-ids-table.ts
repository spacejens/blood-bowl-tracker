import type { AnyPgColumn, PgSchema } from 'drizzle-orm/pg-core';
import { integer, serial, unique, varchar } from 'drizzle-orm/pg-core';

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
  const idColumn = serial('id').primaryKey();
  const ownerColumn = integer(owner.columnName)
    .references(owner.references)
    .notNull();
  const externalSystemIdColumn = integer('external_system_id')
    .references(() => externalSystems.id)
    .notNull();
  const externalIdColumn = varchar('external_id', { length: 255 }).notNull();

  const columns = {
    id: idColumn,
    [owner.key]: ownerColumn,
    externalSystemId: externalSystemIdColumn,
    externalId: externalIdColumn,
  } as Record<TKey, typeof ownerColumn> & {
    id: typeof idColumn;
    externalSystemId: typeof externalSystemIdColumn;
    externalId: typeof externalIdColumn;
  };

  return historyTrackedTable(schema, tableName, columns, (t) => ({
    uniqueExternalId: unique(
      `${tableName}_external_system_id_external_id_unique`,
    ).on(t.externalSystemId, t.externalId),
  }));
}
