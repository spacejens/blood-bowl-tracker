import type { Db } from '@blood-bowl-tracker/db';
import {
  eq,
  externalSystems,
  externalSystemsHistory,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectTestDb } from './e2e-database';

/** The fields of a postgres-js error this suite asserts on. */
interface PostgresErrorFields {
  code: string | undefined;
  tableName: string | undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined;
  }
  const field: unknown = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

/**
 * A failing statement rejects with drizzle's `DrizzleQueryError`, which wraps
 * the driver's error as `.cause`; a failing commit rejects from
 * `db.transaction` with the driver's error itself. Read from whichever
 * carries the SQLSTATE code.
 */
function postgresError(error: unknown): PostgresErrorFields {
  const cause: unknown =
    typeof error === 'object' && error !== null && 'cause' in error
      ? error.cause
      : undefined;
  const source = stringField(error, 'code') === undefined ? cause : error;
  return {
    code: stringField(source, 'code'),
    tableName: stringField(source, 'table_name'),
  };
}

/** Awaits an attempt that must fail, returning its postgres error fields. */
async function rejectionOf(
  attempt: Promise<unknown>,
): Promise<PostgresErrorFields> {
  try {
    await attempt;
  } catch (error) {
    return postgresError(error);
  }
  throw new Error('Expected the attempt to be rejected, but it succeeded.');
}

/** Both tables, in a stable order, for before/after comparison. */
async function snapshotTables(db: Db): Promise<{
  tracked: (typeof externalSystems.$inferSelect)[];
  history: (typeof externalSystemsHistory.$inferSelect)[];
}> {
  return {
    tracked: await db
      .select()
      .from(externalSystems)
      .orderBy(externalSystems.id),
    history: await db
      .select()
      .from(externalSystemsHistory)
      .orderBy(
        externalSystemsHistory.id,
        externalSystemsHistory.historyVersion,
      ),
  };
}

/**
 * Pins the behavior `docs/database.md` (History tracking) describes for
 * history-tracked tables against real Postgres and the real migrations.
 * `external_systems` stands in for every history-tracked table, since all of
 * them share the same `versioning()` / `set_updated_at()` triggers and the
 * same history-table primary key and deferred foreign key.
 */
describe('INSERT ... ON CONFLICT on a history-tracked table (real Postgres)', () => {
  let db: Db;
  let seeded: typeof externalSystems.$inferSelect;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    [seeded] = await db
      .insert(externalSystems)
      .values({ name: 'Existing', category: 'bookkeeping' })
      .returning();
  });

  it('fails at commit with 23503 when a fresh-id row conflicts on a unique column (DO UPDATE)', async () => {
    // Backs docs/database.md, History tracking, the paragraph beginning
    // "Writing to a history-tracked table": a fresh serial id's history row
    // fails the deferred foreign key at commit, nothing is persisted, and a
    // sequence value is still consumed.
    const before = await snapshotTables(db);
    let statementSucceeded = false;

    const error = await rejectionOf(
      db.transaction(async (tx) => {
        await tx
          .insert(externalSystems)
          .values({ name: 'Existing', category: 'imported_data_source' })
          .onConflictDoUpdate({
            target: externalSystems.name,
            set: { category: 'imported_data_source' },
          });
        statementSucceeded = true;
      }),
    );

    expect(statementSucceeded).toBe(true);
    expect(error).toEqual({
      code: '23503',
      tableName: 'external_systems_history',
    });
    expect(await snapshotTables(db)).toEqual(before);

    const [next] = await db
      .insert(externalSystems)
      .values({ name: 'Next', category: 'bookkeeping' })
      .returning();
    expect(next.id).toBe(seeded.id + 2);
  });

  it('fails immediately with 23505 when an existing id is reused (ON CONFLICT (id) DO UPDATE)', async () => {
    // Backs docs/database.md, History tracking, the paragraph beginning
    // "Writing to a history-tracked table": a reused id's history row
    // collides on the history table's (id, history_version) primary key, so
    // the statement itself fails and nothing is persisted.
    const before = await snapshotTables(db);
    let statementSucceeded = false;

    const error = await rejectionOf(
      db.transaction(async (tx) => {
        await tx
          .insert(externalSystems)
          .values({
            id: seeded.id,
            name: 'Existing',
            category: 'imported_data_source',
          })
          .onConflictDoUpdate({
            target: externalSystems.id,
            set: { category: 'imported_data_source' },
          });
        statementSucceeded = true;
      }),
    );

    expect(statementSucceeded).toBe(false);
    expect(error).toEqual({
      code: '23505',
      tableName: 'external_systems_history',
    });
    expect(await snapshotTables(db)).toEqual(before);
  });

  it('fails at commit with 23503 for ON CONFLICT DO NOTHING on a conflicting row', async () => {
    // Backs docs/database.md, History tracking, the paragraph beginning
    // "Writing to a history-tracked table": the rule covers DO NOTHING too,
    // because the trigger has already written the attempted row's history.
    const before = await snapshotTables(db);
    let statementSucceeded = false;

    const error = await rejectionOf(
      db.transaction(async (tx) => {
        await tx
          .insert(externalSystems)
          .values({ name: 'Existing', category: 'bookkeeping' })
          .onConflictDoNothing({ target: externalSystems.name });
        statementSucceeded = true;
      }),
    );

    expect(statementSucceeded).toBe(true);
    expect(error).toEqual({
      code: '23503',
      tableName: 'external_systems_history',
    });
    expect(await snapshotTables(db)).toEqual(before);
  });

  it('writes no history row and leaves updated_at for a no-op plain UPDATE', async () => {
    // Backs docs/database.md, History tracking, the paragraphs beginning
    // "Postgres fires same-timing triggers" (updated_at untouched on a
    // genuine no-op update) and "`versioning()` then fires second" (no
    // history row for a no-op, and RETURNING still returns the row).
    const before = await snapshotTables(db);

    const [row] = await db
      .update(externalSystems)
      .set({ name: 'Existing', category: 'bookkeeping' })
      .where(eq(externalSystems.id, seeded.id))
      .returning();

    expect(row.id).toBe(seeded.id);
    expect(row.updatedAt).toEqual(seeded.updatedAt);
    expect(row.historyVersion).toBe(seeded.historyVersion);
    expect(await snapshotTables(db)).toEqual(before);
  });

  it('writes one new history row and bumps the version for a real plain UPDATE', async () => {
    // Backs docs/database.md, History tracking, the paragraph beginning
    // "`versioning()` then fires second": a real change writes a history row
    // for the new current version.
    const before = await snapshotTables(db);

    const [row] = await db
      .update(externalSystems)
      .set({ category: 'imported_data_source' })
      .where(eq(externalSystems.id, seeded.id))
      .returning();

    expect(row.historyVersion).toBe(seeded.historyVersion + 1);
    const after = await snapshotTables(db);
    expect(after.history).toHaveLength(before.history.length + 1);
    expect(after.history.at(-1)).toMatchObject({
      id: seeded.id,
      historyVersion: row.historyVersion,
      category: 'imported_data_source',
    });
  });
});
