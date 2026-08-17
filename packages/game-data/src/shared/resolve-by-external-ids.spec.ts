import type { Db } from '@blood-bowl-tracker/db';
import { rulesSetExternalIds } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import { resolveByExternalIds } from './resolve-by-external-ids';

function makeDb(rows: unknown[]): { db: Db; select: ReturnType<typeof vi.fn> } {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as unknown as Db, select };
}

const columns = {
  externalIdTable: rulesSetExternalIds,
  ownerIdColumn: rulesSetExternalIds.rulesSetId,
  externalSystemIdColumn: rulesSetExternalIds.externalSystemId,
  externalIdColumn: rulesSetExternalIds.externalId,
};

describe('resolveByExternalIds', () => {
  it('answers each pair with the owning entity id, in input order', async () => {
    const { db } = makeDb([
      { ownerId: 7, externalSystemId: 2, externalId: 'b' },
      { ownerId: 5, externalSystemId: 1, externalId: 'a' },
    ]);

    await expect(
      resolveByExternalIds({
        db,
        ...columns,
        externalIds: [
          { externalSystemId: 1, externalId: 'a' },
          { externalSystemId: 2, externalId: 'b' },
        ],
      }),
    ).resolves.toEqual([
      { found: true, id: 5 },
      { found: true, id: 7 },
    ]);
  });

  it('answers a pair with no stored row as not found', async () => {
    const { db } = makeDb([
      { ownerId: 5, externalSystemId: 1, externalId: 'a' },
    ]);

    await expect(
      resolveByExternalIds({
        db,
        ...columns,
        externalIds: [
          { externalSystemId: 1, externalId: 'a' },
          { externalSystemId: 1, externalId: 'missing' },
        ],
      }),
    ).resolves.toEqual([{ found: true, id: 5 }, { found: false }]);
  });

  it('answers a repeated pair identically at every position', async () => {
    const { db } = makeDb([
      { ownerId: 5, externalSystemId: 1, externalId: 'a' },
    ]);

    await expect(
      resolveByExternalIds({
        db,
        ...columns,
        externalIds: [
          { externalSystemId: 1, externalId: 'a' },
          { externalSystemId: 1, externalId: 'a' },
        ],
      }),
    ).resolves.toEqual([
      { found: true, id: 5 },
      { found: true, id: 5 },
    ]);
  });

  it('does not confuse pairs that share an external id across systems', async () => {
    const { db } = makeDb([
      { ownerId: 5, externalSystemId: 1, externalId: '47' },
      { ownerId: 9, externalSystemId: 2, externalId: '47' },
    ]);

    await expect(
      resolveByExternalIds({
        db,
        ...columns,
        externalIds: [
          { externalSystemId: 2, externalId: '47' },
          { externalSystemId: 1, externalId: '47' },
        ],
      }),
    ).resolves.toEqual([
      { found: true, id: 9 },
      { found: true, id: 5 },
    ]);
  });

  it('returns nothing and issues no query for an empty input', async () => {
    const { db, select } = makeDb([]);

    await expect(
      resolveByExternalIds({ db, ...columns, externalIds: [] }),
    ).resolves.toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
