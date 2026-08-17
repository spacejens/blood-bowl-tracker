import type { ResolveResult } from '@blood-bowl-tracker/api-contract';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DbOrTx } from './db-or-tx';
import { resolveExistingByExternalIds } from './resolve-existing-by-external-ids';
import type { ExternalIdPair } from './sync-external-ids';

/**
 * Answer, for each requested external-id pair, which entity already declares
 * it — the read-only half of what every `upsert()` does internally.
 *
 * Generic over the three column types for the same reason
 * `resolveExistingByExternalIds` is: so the owner id keeps its real `number`
 * type through `db.select()` instead of widening to `unknown`.
 *
 * One query answers the whole list, and the results are index-aligned with
 * the input: a pair with no stored row becomes `{ found: false }` rather
 * than an error, because an unresolved reference is an expected outcome the
 * caller reports as an import error of its own.
 */
export interface ResolveByExternalIdsOptions<
  TOwnerIdColumn extends PgColumn,
  TExternalSystemIdColumn extends PgColumn,
  TExternalIdColumn extends PgColumn,
> {
  db: DbOrTx;
  externalIdTable: PgTable;
  ownerIdColumn: TOwnerIdColumn;
  externalSystemIdColumn: TExternalSystemIdColumn;
  externalIdColumn: TExternalIdColumn;
  externalIds: readonly ExternalIdPair[];
}

function keyOf(pair: ExternalIdPair): string {
  // A tab cannot occur in an external system id (a number) and is not used by
  // any external-id format in this repo, so it cannot collide the way a ':'
  // or '|' separator could.
  return `${pair.externalSystemId}\t${pair.externalId}`;
}

export async function resolveByExternalIds<
  TOwnerIdColumn extends PgColumn,
  TExternalSystemIdColumn extends PgColumn,
  TExternalIdColumn extends PgColumn,
>(
  options: ResolveByExternalIdsOptions<
    TOwnerIdColumn,
    TExternalSystemIdColumn,
    TExternalIdColumn
  >,
): Promise<ResolveResult[]> {
  const { existingRows } = await resolveExistingByExternalIds(options);
  const ownerIdsByKey = new Map<string, number>(
    existingRows.map((row) => [keyOf(row), row.ownerId]),
  );
  return options.externalIds.map((pair) => {
    const id = ownerIdsByKey.get(keyOf(pair));
    return id === undefined ? { found: false } : { found: true, id };
  });
}
