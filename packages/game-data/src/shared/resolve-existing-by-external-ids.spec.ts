import type { Db } from '@blood-bowl-tracker/db';
import { rulesSetExternalIds } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import { resolveExistingByExternalIds } from './resolve-existing-by-external-ids';

function makeDb(rows: unknown[]): Db {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn(() => ({ where }));
  return { select: vi.fn(() => ({ from })) } as unknown as Db;
}

describe('resolveExistingByExternalIds', () => {
  it('returns no owner ids and no rows when nothing matches', async () => {
    const db = makeDb([]);
    await expect(
      resolveExistingByExternalIds({
        db,
        externalIdTable: rulesSetExternalIds,
        ownerIdColumn: rulesSetExternalIds.rulesSetId,
        externalSystemIdColumn: rulesSetExternalIds.externalSystemId,
        externalIdColumn: rulesSetExternalIds.externalId,
        externalIds: [{ externalSystemId: 1, externalId: 'a' }],
      }),
    ).resolves.toEqual({ ownerIds: [], existingRows: [] });
  });

  it('returns nothing and never queries when externalIds is empty', async () => {
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const db = { select } as unknown as Db;

    await expect(
      resolveExistingByExternalIds({
        db,
        externalIdTable: rulesSetExternalIds,
        ownerIdColumn: rulesSetExternalIds.rulesSetId,
        externalSystemIdColumn: rulesSetExternalIds.externalSystemId,
        externalIdColumn: rulesSetExternalIds.externalId,
        externalIds: [],
      }),
    ).resolves.toEqual({ ownerIds: [], existingRows: [] });

    expect(select).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
  });

  it('dedupes owner ids across several matching external ids', async () => {
    const db = makeDb([
      { ownerId: 5, externalSystemId: 1, externalId: 'a' },
      { ownerId: 5, externalSystemId: 2, externalId: 'b' },
    ]);
    const result = await resolveExistingByExternalIds({
      db,
      externalIdTable: rulesSetExternalIds,
      ownerIdColumn: rulesSetExternalIds.rulesSetId,
      externalSystemIdColumn: rulesSetExternalIds.externalSystemId,
      externalIdColumn: rulesSetExternalIds.externalId,
      externalIds: [
        { externalSystemId: 1, externalId: 'a' },
        { externalSystemId: 2, externalId: 'b' },
      ],
    });
    expect(result.ownerIds).toEqual([5]);
    expect(result.existingRows).toEqual([
      { externalSystemId: 1, externalId: 'a' },
      { externalSystemId: 2, externalId: 'b' },
    ]);
  });

  it('reports every distinct owner id when external ids conflict', async () => {
    const db = makeDb([
      { ownerId: 5, externalSystemId: 1, externalId: 'a' },
      { ownerId: 6, externalSystemId: 2, externalId: 'b' },
    ]);
    const result = await resolveExistingByExternalIds({
      db,
      externalIdTable: rulesSetExternalIds,
      ownerIdColumn: rulesSetExternalIds.rulesSetId,
      externalSystemIdColumn: rulesSetExternalIds.externalSystemId,
      externalIdColumn: rulesSetExternalIds.externalId,
      externalIds: [
        { externalSystemId: 1, externalId: 'a' },
        { externalSystemId: 2, externalId: 'b' },
      ],
    });
    expect(result.ownerIds).toEqual([5, 6]);
  });
});
