import type { Db } from '@blood-bowl-tracker/db';
import { rulesSetExternalIds } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import { insertMissingExternalIds } from './sync-external-ids';

function makeDb(): { db: Db; values: ReturnType<typeof vi.fn> } {
  const values = vi.fn().mockResolvedValue(undefined);
  const db = { insert: vi.fn(() => ({ values })) } as unknown as Db;
  return { db, values };
}

describe('insertMissingExternalIds', () => {
  it('inserts only the pairs not already present', async () => {
    const { db, values } = makeDb();
    await insertMissingExternalIds({
      db,
      externalIdTable: rulesSetExternalIds,
      existingRows: [{ externalSystemId: 1, externalId: 'a' }],
      externalIds: [
        { externalSystemId: 1, externalId: 'a' },
        { externalSystemId: 2, externalId: 'b' },
      ],
      buildRow: (pair) => ({ rulesSetId: 99, ...pair }),
    });
    expect(values).toHaveBeenCalledWith([
      { rulesSetId: 99, externalSystemId: 2, externalId: 'b' },
    ]);
  });

  it('does not touch the database when every pair already exists', async () => {
    const { db, values } = makeDb();
    await insertMissingExternalIds({
      db,
      externalIdTable: rulesSetExternalIds,
      existingRows: [{ externalSystemId: 1, externalId: 'a' }],
      externalIds: [{ externalSystemId: 1, externalId: 'a' }],
      buildRow: (pair) => ({ rulesSetId: 99, ...pair }),
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(db.insert).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
  });

  it('distinguishes the same external id in different systems', async () => {
    const { db, values } = makeDb();
    await insertMissingExternalIds({
      db,
      externalIdTable: rulesSetExternalIds,
      existingRows: [{ externalSystemId: 1, externalId: 'a' }],
      externalIds: [{ externalSystemId: 2, externalId: 'a' }],
      buildRow: (pair) => ({ rulesSetId: 99, ...pair }),
    });
    expect(values).toHaveBeenCalledWith([
      { rulesSetId: 99, externalSystemId: 2, externalId: 'a' },
    ]);
  });
});
