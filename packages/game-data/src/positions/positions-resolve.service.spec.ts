import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { PositionsService } from './positions.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionsService,
      { provide: DB, useValue: db },
      { provide: LikePatternService, useValue: mock<LikePatternService>() },
    ],
  }).compile();
  return { service: moduleRef.get(PositionsService), chains };
}

describe('PositionsService.resolveBatch', () => {
  it('answers each pair with the position id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: '12-47' },
    ]);

    await expect(
      service.resolveBatch([
        { externalSystemId: 1, externalId: '12-47' },
        { externalSystemId: 1, externalId: '12-999' },
      ]),
    ).resolves.toEqual([{ found: true, id: 4 }, { found: false }]);
  });

  it('returns an empty array without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(service.resolveBatch([])).resolves.toEqual([]);
    expect(chains).toHaveLength(0);
  });
});

describe('PositionsService.resolve', () => {
  it('answers a single pair with the position id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: '12-47' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '12-47' }),
    ).resolves.toEqual({ found: true, id: 4 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '12-missing' }),
    ).resolves.toEqual({ found: false });
  });
});
