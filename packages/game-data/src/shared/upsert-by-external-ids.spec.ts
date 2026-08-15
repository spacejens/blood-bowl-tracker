import type { Db } from '@blood-bowl-tracker/db';
import {
  eraExternalIds,
  eras,
  rulesSetExternalIds,
  rulesSets,
} from '@blood-bowl-tracker/db';
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
});
