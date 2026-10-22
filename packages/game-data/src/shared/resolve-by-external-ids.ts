import type {
  ExternalId,
  ResolveResult,
} from '@blood-bowl-tracker/api-contract';
import type { DbOrTx, PgColumn, PgTable } from '@blood-bowl-tracker/db';

import { resolveExistingByExternalIds } from './resolve-existing-by-external-ids';

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
  externalIds: readonly ExternalId[];
}

function keyOf({ externalSystemId, externalId }: ExternalId): string {
  // A tab cannot occur in an external system id (a number) and is not used by
  // any external-id format in this repo, so it cannot collide the way a ':'
  // or '|' separator could.
  return `${externalSystemId}\t${externalId}`;
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
  return options.externalIds.map((externalId) => {
    const id = ownerIdsByKey.get(keyOf(externalId));
    return id === undefined ? { found: false } : { found: true, id };
  });
}
