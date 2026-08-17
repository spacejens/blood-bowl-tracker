import type { Db } from '@blood-bowl-tracker/db';
import {
  competitionGroupExternalIds,
  competitionGroups,
  eraExternalIds,
  eras,
  rulesSetExternalIds,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { MissingRequiredFieldError } from './missing-required-field-error';
import { upsertByExternalIds } from './upsert-by-external-ids';
import { UpsertConflictError } from './upsert-conflict-error';

class TestConflictError extends UpsertConflictError {}

function makeDb(opts: {
  resolveRows: unknown[];
  entityRow: unknown;
  reselectRows?: unknown[];
}) {
  // Call 0 is resolveExistingByExternalIds' external-id lookup; call 1 (only
  // issued on the all-fields-omitted path) re-reads the untouched entity row.
  const selectResults = [opts.resolveRows, opts.reselectRows ?? []];
  let selectCall = 0;
  const where = vi.fn(() => Promise.resolve(selectResults[selectCall++] ?? []));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  const insertReturning = vi.fn().mockResolvedValue([opts.entityRow]);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateReturning = vi.fn().mockResolvedValue([opts.entityRow]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  // `transaction` really invokes its callback with the same mock handle as
  // `tx`, matching real `db.transaction()` semantics, so every query issued
  // inside the transaction still lands on these same mocks.
  const handle: Record<string, unknown> = { select, insert, update };
  const transaction = vi.fn(
    async (callback: (tx: unknown) => unknown) => await callback(handle),
  );
  handle.transaction = transaction;

  const db = handle as unknown as Db;
  return { db, select, insert, insertValues, update, updateSet, transaction };
}

/**
 * The shape actually thrown in production: drizzle-orm 1.0.0-rc.4's pg-core
 * session wraps every query failure in a real `DrizzleQueryError` (imported
 * from `drizzle-orm` itself, not hand-rolled, so a future drizzle release
 * that changes where it stashes the driver error breaks this test rather
 * than silently keeping production's dead-code regression hidden), whose
 * `cause` is the real `postgres` driver's `PostgresError` — the only place
 * `code`, `table_name` and `constraint_name` actually live. The classifier
 * under test must unwrap this `.cause` chain, so the mock has to reproduce it
 * rather than throwing an unwrapped postgres-shaped error directly (which
 * production code never does for a query issued through drizzle).
 *
 * `constraintName` defaults to the table's real external-id unique
 * constraint, so a test can override it (e.g. to `<table>_pkey`) to prove the
 * classifier excludes violations of the table's *other* constraints.
 */
function uniqueViolation(tableName: string, constraintName?: string): Error {
  const pgError = Object.assign(
    new Error('duplicate key value violates unique constraint'),
    {
      code: '23505',
      table_name: tableName,
      constraint_name:
        constraintName ?? `${tableName}_external_system_id_external_id_unique`,
    },
  );
  return new DrizzleQueryError('insert into ...', [], pgError);
}

/**
 * A db mock for the concurrent-race tests.
 *
 * `resolveRowsPerAttempt[n]` is what the nth attempt's external-id lookup
 * returns, so a test can make attempt 1 find nothing (insert path) and
 * attempt 2 find the row the concurrent winner committed (update path).
 * `insertErrors[n]`, when set, is thrown by the nth `insert(...).values(...)`
 * call — on the insert path call 0 is the entity insert and call 1 is the
 * external-id insert, so `[undefined, uniqueViolation(...)]` simulates losing
 * the race on the join table exactly where the real driver would raise it.
 */
function makeRaceDb(opts: {
  resolveRowsPerAttempt: unknown[][];
  entityRow: unknown;
  insertErrors: readonly (Error | undefined)[];
}) {
  let selectCall = 0;
  const where = vi.fn(() =>
    Promise.resolve(opts.resolveRowsPerAttempt[selectCall++] ?? []),
  );
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  let insertCall = 0;
  const insertReturning = vi.fn().mockResolvedValue([opts.entityRow]);
  const insertValues = vi.fn(() => {
    const error = opts.insertErrors[insertCall++];
    if (error !== undefined) {
      throw error;
    }
    return { returning: insertReturning };
  });
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateReturning = vi.fn().mockResolvedValue([opts.entityRow]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const handle: Record<string, unknown> = { select, insert, update };
  const transaction = vi.fn(
    async (callback: (tx: unknown) => unknown) => await callback(handle),
  );
  handle.transaction = transaction;

  const db = handle as unknown as Db;
  return { db, select, insertValues, update, updateSet, transaction };
}

// Shared column wiring — rulesSets is used the same way in the other
// shared specs (resolve-existing-by-external-ids.spec, sync-external-ids.spec).
function baseOpts(db: Db) {
  return {
    db,
    entityTable: rulesSets,
    entityIdColumn: rulesSets.id,
    values: { name: 'Foo' },
    externalIdTable: rulesSetExternalIds,
    ownerIdColumn: rulesSetExternalIds.rulesSetId,
    externalSystemIdColumn: rulesSetExternalIds.externalSystemId,
    externalIdColumn: rulesSetExternalIds.externalId,
    externalIds: [{ externalSystemId: 1, externalId: 'a' }],
    ConflictErrorClass: TestConflictError,
    entityLabelPlural: 'rules sets',
    buildExternalIdRow: (
      rulesSetId: number,
      pair: {
        externalSystemId: number;
        externalId: string;
      },
    ) => ({ rulesSetId, ...pair }),
  } as const;
}

// eras is the smallest table in the schema that carries all three shapes the
// overlay logic distinguishes: NOT NULL columns without a default (name,
// leagueId, startDate), a nullable column (endDate), and NOT NULL columns that
// DO have a default and so must be ignored by the required-field check
// (id/createdAt/updatedAt/historyVersion/historyPeriod).
function eraOpts(db: Db, values: Record<string, unknown>) {
  return {
    db,
    entityTable: eras,
    entityIdColumn: eras.id,
    values,
    externalIdTable: eraExternalIds,
    ownerIdColumn: eraExternalIds.eraId,
    externalSystemIdColumn: eraExternalIds.externalSystemId,
    externalIdColumn: eraExternalIds.externalId,
    externalIds: [{ externalSystemId: 1, externalId: 'a' }],
    ConflictErrorClass: TestConflictError,
    entityLabelPlural: 'eras',
    buildExternalIdRow: (
      eraId: number,
      pair: { externalSystemId: number; externalId: string },
    ) => ({ eraId, ...pair }),
  } as const;
}

describe('upsertByExternalIds', () => {
  it('runs the resolve, the entity write and the external-id insert in one transaction', async () => {
    // The entity row and its external-id row must commit or roll back
    // together; a separate, already-committed entity insert is exactly the
    // orphaned row this guards against.
    const { db, transaction, insertValues } = makeDb({
      resolveRows: [],
      entityRow: { id: 7, name: 'Foo' },
    });

    const result = await upsertByExternalIds(baseOpts(db));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ row: { id: 7, name: 'Foo' }, created: true });
    // Both writes went through the handle the transaction supplied.
    expect(insertValues).toHaveBeenNthCalledWith(1, { name: 'Foo' });
    expect(insertValues).toHaveBeenNthCalledWith(2, [
      { rulesSetId: 7, externalSystemId: 1, externalId: 'a' },
    ]);
  });

  it('throws the given conflict error when external ids match >1 owner', async () => {
    const { db, insert, update } = makeDb({
      resolveRows: [
        { ownerId: 5, externalSystemId: 1, externalId: 'a' },
        { ownerId: 6, externalSystemId: 2, externalId: 'b' },
      ],
      entityRow: { id: 5, name: 'Foo' },
    });
    await expect(upsertByExternalIds(baseOpts(db))).rejects.toThrow(
      new TestConflictError(
        'External IDs matched multiple existing rules sets: 5, 6',
      ),
    );
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('inserts a new row and its missing external ids when nothing matches', async () => {
    const { db, insert, update, insertValues } = makeDb({
      resolveRows: [],
      entityRow: { id: 7, name: 'Foo' },
    });
    const result = await upsertByExternalIds(baseOpts(db));
    expect(result).toEqual({ row: { id: 7, name: 'Foo' }, created: true });
    expect(insert).toHaveBeenCalledWith(rulesSets); // entity insert
    expect(update).not.toHaveBeenCalled();
    // Second insert(...).values(...) call carries the built external-id rows.
    expect(insertValues).toHaveBeenLastCalledWith([
      { rulesSetId: 7, externalSystemId: 1, externalId: 'a' },
    ]);
  });

  it('updates the matched row and syncs external ids when exactly one matches', async () => {
    const { db, insert, update, updateSet, insertValues } = makeDb({
      resolveRows: [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
      entityRow: { id: 5, name: 'Foo' },
    });
    const result = await upsertByExternalIds(baseOpts(db));
    expect(result).toEqual({ row: { id: 5, name: 'Foo' }, created: false });
    expect(update).toHaveBeenCalledWith(rulesSets);
    expect(updateSet).toHaveBeenCalledWith({ name: 'Foo' });
    // resolveRows already contains {1,'a'}, so no NEW external ids to insert.
    expect(insert).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('omits an undefined field from the update, leaving the stored value alone', async () => {
    const { db, updateSet } = makeDb({
      resolveRows: [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
      entityRow: { id: 5, name: 'Renamed', endDate: '2023-06-10' },
    });

    await upsertByExternalIds(
      eraOpts(db, { name: 'Renamed', endDate: undefined }),
    );

    expect(updateSet).toHaveBeenCalledWith({ name: 'Renamed' });
  });

  it('passes an explicit null straight through so the caller can clear a field', async () => {
    const { db, updateSet } = makeDb({
      resolveRows: [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
      entityRow: { id: 5, name: 'Renamed', endDate: null },
    });

    await upsertByExternalIds(eraOpts(db, { name: 'Renamed', endDate: null }));

    expect(updateSet).toHaveBeenCalledWith({ name: 'Renamed', endDate: null });
  });

  it('skips the update and re-selects the row when every field is omitted', async () => {
    // .set({}) is not valid drizzle, so an externalIds-only payload must read
    // the current row back instead of writing an empty update.
    const { db, select, update } = makeDb({
      resolveRows: [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
      entityRow: { id: 5, name: 'Untouched' },
      reselectRows: [{ id: 5, name: 'Untouched', endDate: '2023-06-10' }],
    });

    const result = await upsertByExternalIds(
      eraOpts(db, { name: undefined, endDate: undefined }),
    );

    expect(update).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      row: { id: 5, name: 'Untouched', endDate: '2023-06-10' },
      created: false,
    });
  });

  it('throws MissingRequiredFieldError naming every missing column on the insert path', async () => {
    const { db, insert } = makeDb({
      resolveRows: [],
      entityRow: { id: 7, name: 'Nope' },
    });

    await expect(
      upsertByExternalIds(eraOpts(db, { name: 'Nope' })),
    ).rejects.toThrow(
      new MissingRequiredFieldError(
        'Cannot create new eras: missing required field(s): leagueId, startDate',
      ),
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts when every no-default NOT NULL column is supplied, ignoring defaulted ones', async () => {
    // id/createdAt/updatedAt/historyVersion/historyPeriod are NOT NULL but
    // carry database defaults, so their absence must not trip the check.
    const { db, insertValues } = makeDb({
      resolveRows: [],
      entityRow: { id: 7, name: 'New era' },
    });

    const result = await upsertByExternalIds(
      eraOpts(db, {
        name: 'New era',
        leagueId: 10,
        startDate: '2021-09-01',
        endDate: undefined,
      }),
    );

    expect(result.created).toBe(true);
    // endDate was undefined, so it is stripped rather than inserted.
    expect(insertValues).toHaveBeenNthCalledWith(1, {
      name: 'New era',
      leagueId: 10,
      startDate: '2021-09-01',
    });
  });

  describe('detectSemanticConflict', () => {
    it('does not run the extra read when no hook is supplied', async () => {
      const { db, select } = makeDb({
        resolveRows: [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
        entityRow: { id: 5, name: 'Foo' },
      });

      await upsertByExternalIds(baseOpts(db));

      // Just the resolve select; no per-entity hook means no extra read.
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('throws the given conflict error when the hook flags the single matched row', async () => {
      const { db, update } = makeDb({
        resolveRows: [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
        entityRow: { id: 5, name: 'Foo' },
        // The re-read (2nd select call) returns the existing row the hook
        // inspects. A stand-in for the real position case: some stored field
        // (here `name`) disagrees with the incoming value in a way the mere
        // single-owner match cannot see on its own.
        reselectRows: [{ id: 5, name: 'Old name' }],
      });

      await expect(
        upsertByExternalIds({
          ...baseOpts(db),
          detectSemanticConflict: (
            existingRow: { name: string },
            values: { name?: string },
          ) => values.name !== undefined && existingRow.name !== values.name,
        }),
      ).rejects.toThrow(TestConflictError);
      expect(update).not.toHaveBeenCalled();
    });

    it('applies the update normally when the hook reports no conflict', async () => {
      const { db, update, updateSet } = makeDb({
        resolveRows: [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
        entityRow: { id: 5, name: 'Foo' },
        reselectRows: [{ id: 5, name: 'Foo' }],
      });

      const result = await upsertByExternalIds({
        ...baseOpts(db),
        detectSemanticConflict: (
          existingRow: { name: string },
          values: { name?: string },
        ) => values.name !== undefined && existingRow.name !== values.name,
      });

      expect(result).toEqual({
        row: { id: 5, name: 'Foo' },
        created: false,
      });
      expect(update).toHaveBeenCalledWith(rulesSets);
      expect(updateSet).toHaveBeenCalledWith({ name: 'Foo' });
    });

    it('does not run the hook on the insert (no-owner-matched) path', async () => {
      const detectSemanticConflict = vi.fn().mockReturnValue(true);
      const { db, insert } = makeDb({
        resolveRows: [],
        entityRow: { id: 7, name: 'Foo' },
      });

      const result = await upsertByExternalIds({
        ...baseOpts(db),
        detectSemanticConflict,
      });

      expect(result.created).toBe(true);
      expect(detectSemanticConflict).not.toHaveBeenCalled();
      expect(insert).toHaveBeenCalledWith(rulesSets);
    });
  });

  describe('concurrent external-id race', () => {
    // rulesSetExternalIds' table name is `rules_sets_external_ids`; the
    // classifier now matches on this table name rather than the (fragile,
    // possibly-truncated) constraint name.
    const tableName = 'rules_sets_external_ids';

    it('retries and reconciles onto the row the concurrent writer committed', async () => {
      const { db, transaction, update, updateSet } = makeRaceDb({
        // Attempt 1 finds nothing and takes the insert path; attempt 2 sees
        // the winner's committed external-id row and takes the update path.
        resolveRowsPerAttempt: [
          [],
          [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
        ],
        entityRow: { id: 5, name: 'Foo' },
        insertErrors: [undefined, uniqueViolation(tableName)],
      });

      const result = await upsertByExternalIds(baseOpts(db));

      expect(result).toEqual({ row: { id: 5, name: 'Foo' }, created: false });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenCalledWith(rulesSets);
      expect(updateSet).toHaveBeenCalledWith({ name: 'Foo' });
    });

    it('gives up after exactly 3 attempts', async () => {
      const { db, transaction, insertValues } = makeRaceDb({
        resolveRowsPerAttempt: [[], [], []],
        entityRow: { id: 7, name: 'Foo' },
        insertErrors: [
          undefined,
          uniqueViolation(tableName),
          undefined,
          uniqueViolation(tableName),
          undefined,
          uniqueViolation(tableName),
        ],
      });

      await expect(upsertByExternalIds(baseOpts(db))).rejects.toThrow(
        /after 3 attempts/,
      );
      expect(transaction).toHaveBeenCalledTimes(3);
      // Per attempt: one entity insert plus one external-id insert.
      expect(insertValues).toHaveBeenCalledTimes(6);
    });

    it('exposes the last violation as the exhausted error cause', async () => {
      const lastViolation = uniqueViolation(tableName);
      const { db } = makeRaceDb({
        resolveRowsPerAttempt: [[], [], []],
        entityRow: { id: 7, name: 'Foo' },
        insertErrors: [
          undefined,
          uniqueViolation(tableName),
          undefined,
          uniqueViolation(tableName),
          undefined,
          lastViolation,
        ],
      });

      const caught: unknown = await upsertByExternalIds(baseOpts(db)).catch(
        (error: unknown) => error,
      );

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).cause).toBe(lastViolation);
    });

    it('does not retry a unique violation on some other table', async () => {
      const other = uniqueViolation('some_other_table');
      const { db, transaction } = makeRaceDb({
        resolveRowsPerAttempt: [[]],
        entityRow: { id: 7, name: 'Foo' },
        insertErrors: [undefined, other],
      });

      await expect(upsertByExternalIds(baseOpts(db))).rejects.toBe(other);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('retries when the constraint name is truncated by Postgres’ 63-byte identifier limit (competition_groups_external_ids)', async () => {
      // `competition_groups_external_ids_external_system_id_external_id_unique`
      // is 69 bytes, so Postgres truncates the real constraint name on
      // creation. Matching on table_name instead of the (possibly truncated)
      // constraint name means this case works without any special-casing.
      const longTableName = 'competition_groups_external_ids';
      const { db, transaction, update, updateSet } = makeRaceDb({
        resolveRowsPerAttempt: [
          [],
          [{ ownerId: 9, externalSystemId: 1, externalId: 'a' }],
        ],
        entityRow: { id: 9, name: 'Foo' },
        insertErrors: [undefined, uniqueViolation(longTableName)],
      });

      const result = await upsertByExternalIds({
        ...baseOpts(db),
        entityTable: competitionGroups,
        values: { name: 'Foo', leagueId: 1 },
        externalIdTable: competitionGroupExternalIds,
        buildExternalIdRow: (
          competitionGroupId: number,
          pair: { externalSystemId: number; externalId: string },
        ) => ({ competitionGroupId, ...pair }),
      });

      expect(result).toEqual({ row: { id: 9, name: 'Foo' }, created: false });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenCalledWith(competitionGroups);
      expect(updateSet).toHaveBeenCalledWith({ name: 'Foo', leagueId: 1 });
    });

    it('does not retry an error that is not a unique violation', async () => {
      const boom = new Error('connection lost');
      const { db, transaction } = makeRaceDb({
        resolveRowsPerAttempt: [[]],
        entityRow: { id: 7, name: 'Foo' },
        insertErrors: [undefined, boom],
      });

      await expect(upsertByExternalIds(baseOpts(db))).rejects.toBe(boom);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('does not retry a thrown value that is not an object at all', async () => {
      // Defensive: classifying the caught value must not itself throw.
      const notAnError = 'kaboom' as unknown as Error;
      const { db, transaction } = makeRaceDb({
        resolveRowsPerAttempt: [[]],
        entityRow: { id: 7, name: 'Foo' },
        insertErrors: [undefined, notAnError],
      });

      await expect(upsertByExternalIds(baseOpts(db))).rejects.toBe(notAnError);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('does not retry a primary-key violation on the external-id table', async () => {
      // A `_pkey` violation shares the table and SQLSTATE with the race this
      // code retries, but it is a different, real infrastructure bug (e.g. a
      // desynced `serial` sequence) — it must surface immediately, not be
      // silently retried three times and misreported as a lost race.
      const pkeyViolation = uniqueViolation(tableName, `${tableName}_pkey`);
      const { db, transaction } = makeRaceDb({
        resolveRowsPerAttempt: [[]],
        entityRow: { id: 7, name: 'Foo' },
        insertErrors: [undefined, pkeyViolation],
      });

      await expect(upsertByExternalIds(baseOpts(db))).rejects.toBe(
        pkeyViolation,
      );
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('does not retry a non-unique violation on the external-id table', async () => {
      // Proves the SQLSTATE check is not redundant with the table-name check:
      // a NOT NULL violation (23502) on the same table must not be retried.
      const notNull = Object.assign(new Error('Failed query'), {
        cause: Object.assign(new Error('null value in column'), {
          code: '23502',
          table_name: tableName,
        }),
      });
      const { db, transaction } = makeRaceDb({
        resolveRowsPerAttempt: [[]],
        entityRow: { id: 7, name: 'Foo' },
        insertErrors: [undefined, notNull],
      });

      await expect(upsertByExternalIds(baseOpts(db))).rejects.toBe(notNull);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('stops unwrapping once the cause chain is deeper than the bound', async () => {
      const buried = uniqueViolation(tableName);
      const deep = Object.assign(new Error('l1'), {
        cause: Object.assign(new Error('l2'), {
          cause: Object.assign(new Error('l3'), { cause: buried }),
        }),
      });
      const { db, transaction } = makeRaceDb({
        resolveRowsPerAttempt: [[]],
        entityRow: { id: 7, name: 'Foo' },
        insertErrors: [undefined, deep],
      });

      await expect(upsertByExternalIds(baseOpts(db))).rejects.toBe(deep);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('retries a bare, unwrapped postgres-shaped error (no DrizzleQueryError wrapper)', async () => {
      // Not every violation reaches the classifier pre-wrapped: a deferred
      // constraint can surface at COMMIT time via postgres.js directly,
      // outside drizzle's query-execution wrapping. The classifier checks the
      // caught value itself before unwrapping `.cause`, so this must retry
      // exactly like the normal, wrapped case.
      const bare = Object.assign(new Error('duplicate key value'), {
        code: '23505',
        table_name: tableName,
        constraint_name: `${tableName}_external_system_id_external_id_unique`,
      });
      const { db, transaction, update, updateSet } = makeRaceDb({
        resolveRowsPerAttempt: [
          [],
          [{ ownerId: 5, externalSystemId: 1, externalId: 'a' }],
        ],
        entityRow: { id: 5, name: 'Foo' },
        insertErrors: [undefined, bare],
      });

      const result = await upsertByExternalIds(baseOpts(db));

      expect(result).toEqual({ row: { id: 5, name: 'Foo' }, created: false });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenCalledWith(rulesSets);
      expect(updateSet).toHaveBeenCalledWith({ name: 'Foo' });
    });
  });
});
