import type { Db } from '@blood-bowl-tracker/db';
import { and, eq, or } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { ExternalIdPair } from './sync-external-ids';

/**
 * Find the entity, if any, that the given external ids already identify.
 *
 * Shared by every game-data `upsert()`: the lookup is identical across all
 * eleven entities apart from the join table and its column names. What the
 * caller does with the answer is NOT shared — the conflict error class and
 * message, the insert/update branch, and the entity-specific tail all diverge
 * genuinely and stay with each service.
 *
 * `ownerIds` preserves first-seen order, because the upsert conflict messages
 * render it. More than one means the external ids disagree about which entity
 * they name; the caller decides what that means.
 *
 * Generic over the three column types (rather than typed as the bare `Column`
 * base) so the owner id, external system id and external id keep their real
 * (`number`/`string`) data types through `db.select()` instead of widening to
 * `unknown` — that widening is what would have forced a cast on the return.
 */
export async function resolveExistingByExternalIds<
  TOwnerIdColumn extends PgColumn,
  TExternalSystemIdColumn extends PgColumn,
  TExternalIdColumn extends PgColumn,
>(
  db: Db,
  table: PgTable,
  ownerIdColumn: TOwnerIdColumn,
  externalSystemIdColumn: TExternalSystemIdColumn,
  externalIdColumn: TExternalIdColumn,
  externalIds: readonly ExternalIdPair[],
): Promise<{ ownerIds: number[]; existingRows: ExternalIdPair[] }> {
  if (externalIds.length === 0) {
    return { ownerIds: [], existingRows: [] };
  }

  const rows = await db
    .select({
      ownerId: ownerIdColumn,
      externalSystemId: externalSystemIdColumn,
      externalId: externalIdColumn,
    })
    .from(table)
    .where(
      or(
        ...externalIds.map((e) =>
          and(
            eq(externalSystemIdColumn, e.externalSystemId),
            eq(externalIdColumn, e.externalId),
          ),
        ),
      ),
    );

  return {
    ownerIds: [...new Set(rows.map((r) => r.ownerId))],
    existingRows: rows.map((r) => ({
      externalSystemId: r.externalSystemId,
      externalId: r.externalId,
    })),
  };
}
