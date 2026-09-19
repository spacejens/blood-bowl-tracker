import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { KeywordsService } from './keywords.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [KeywordsService, { provide: DB, useValue: db }],
  }).compile();
  return { service: moduleRef.get(KeywordsService), chains };
}

describe('KeywordsService.resolveBatch', () => {
  it('answers each pair with the keyword id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 7, externalSystemId: 1, externalId: '3' },
    ]);

    await expect(
      service.resolveBatch([
        { externalSystemId: 1, externalId: '3' },
        { externalSystemId: 1, externalId: '999' },
      ]),
    ).resolves.toEqual([{ found: true, id: 7 }, { found: false }]);
  });

  it('returns an empty array without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(service.resolveBatch([])).resolves.toEqual([]);
    expect(chains).toHaveLength(0);
  });
});

describe('KeywordsService.resolve', () => {
  it('answers a single pair with the keyword id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 7, externalSystemId: 1, externalId: '3' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '3' }),
    ).resolves.toEqual({ found: true, id: 7 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '404' }),
    ).resolves.toEqual({ found: false });
  });
});
