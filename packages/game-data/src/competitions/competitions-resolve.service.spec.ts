import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { CompetitionsService } from './competitions.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionsService,
      { provide: DB, useValue: db },
      { provide: LikePatternService, useValue: mock<LikePatternService>() },
    ],
  }).compile();
  return { service: moduleRef.get(CompetitionsService), chains };
}

describe('CompetitionsService.resolveBatch', () => {
  it('answers each pair with the competition id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: '1234' },
    ]);

    await expect(
      service.resolveBatch([
        { externalSystemId: 1, externalId: '1234' },
        { externalSystemId: 1, externalId: '9999' },
      ]),
    ).resolves.toEqual([{ found: true, id: 4 }, { found: false }]);
  });

  it('returns an empty array without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(service.resolveBatch([])).resolves.toEqual([]);
    expect(chains).toHaveLength(0);
  });
});

describe('CompetitionsService.resolve', () => {
  it('answers a single pair with the competition id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: '1234' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '1234' }),
    ).resolves.toEqual({ found: true, id: 4 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'missing' }),
    ).resolves.toEqual({ found: false });
  });
});
