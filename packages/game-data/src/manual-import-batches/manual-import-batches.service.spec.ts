import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  ManualImportBatchContentMismatchError,
  ManualImportBatchesService,
} from './manual-import-batches.service';

const HASH = 'a'.repeat(64);
const row = {
  name: '001-initial-seed',
  contentHash: HASH,
  appliedAt: new Date('2026-10-18T00:00:00Z'),
};

async function makeService(...rowsPerQuery: unknown[][]) {
  const db = mockDb(...rowsPerQuery);
  const moduleRef = await Test.createTestingModule({
    providers: [ManualImportBatchesService, { provide: DB, useValue: db.db }],
  }).compile();
  return { service: moduleRef.get(ManualImportBatchesService), db };
}

describe('ManualImportBatchesService', () => {
  it('lists every recorded batch', async () => {
    const { service } = await makeService([row]);

    await expect(service.listAll()).resolves.toEqual([row]);
  });

  it('inserts a batch that is not recorded yet', async () => {
    // query 0: the insert returns the new row.
    const { service, db } = await makeService([row]);

    await expect(
      service.record({ name: row.name, contentHash: HASH }),
    ).resolves.toEqual({ batch: row, created: true });
    expect(db.db.insert).toHaveBeenCalledTimes(1);
    expect(db.db.select).not.toHaveBeenCalled();
    expect(db.chains[0].onConflictDoNothing).toHaveBeenCalled();
  });

  it('answers created: false for a batch already recorded with the same content', async () => {
    // query 0: the insert hits the conflict and returns nothing; query 1: the lookup.
    const { service, db } = await makeService([], [row]);

    await expect(
      service.record({ name: row.name, contentHash: HASH }),
    ).resolves.toEqual({ batch: row, created: false });
    expect(extractFilterValues(firstCallArg(db.chains[1].where))).toContain(
      row.name,
    );
  });

  it('rejects a batch already recorded with different content', async () => {
    const { service } = await makeService([], [row]);

    await expect(
      service.record({ name: row.name, contentHash: 'b'.repeat(64) }),
    ).rejects.toBeInstanceOf(ManualImportBatchContentMismatchError);
  });
});
