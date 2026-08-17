import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import { CompetitionGroupsService } from './competition-groups.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionGroupsService,
      { provide: DB, useValue: db },
      { provide: LikePatternService, useValue: mock<LikePatternService>() },
    ],
  }).compile();
  return { service: moduleRef.get(CompetitionGroupsService), chains };
}

describe('CompetitionGroupsService.resolveBatch', () => {
  it('answers each pair with the competition group id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: 'Major Season' },
    ]);

    await expect(
      service.resolveBatch([
        { externalSystemId: 1, externalId: 'Major Season' },
        { externalSystemId: 1, externalId: 'No Such Group' },
      ]),
    ).resolves.toEqual([{ found: true, id: 4 }, { found: false }]);
  });

  it('returns an empty array without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(service.resolveBatch([])).resolves.toEqual([]);
    expect(chains).toHaveLength(0);
  });
});

describe('CompetitionGroupsService.resolve', () => {
  it('answers a single pair with the competition group id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: 'Major Season' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'Major Season' }),
    ).resolves.toEqual({ found: true, id: 4 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'ghost' }),
    ).resolves.toEqual({ found: false });
  });
});
