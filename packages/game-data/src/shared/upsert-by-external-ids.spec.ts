import type { Db } from '@blood-bowl-tracker/db';
import { rulesSetExternalIds, rulesSets } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import { upsertByExternalIds } from './upsert-by-external-ids';
import { UpsertConflictError } from './upsert-conflict-error';

class TestConflictError extends UpsertConflictError {}

function makeDb(opts: { resolveRows: unknown[]; entityRow: unknown }) {
  const where = vi.fn().mockResolvedValue(opts.resolveRows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  const insertReturning = vi.fn().mockResolvedValue([opts.entityRow]);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateReturning = vi.fn().mockResolvedValue([opts.entityRow]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const db = { select, insert, update } as unknown as Db;
  return { db, insert, insertValues, update, updateSet };
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

describe('upsertByExternalIds', () => {
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
});
