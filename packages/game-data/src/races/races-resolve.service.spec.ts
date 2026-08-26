import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import { RacesService } from './races.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      RacesService,
      { provide: DB, useValue: db },
      { provide: LikePatternService, useValue: mock<LikePatternService>() },
      {
        provide: MatchOutcomeCountsService,
        useValue: mock<MatchOutcomeCountsService>(),
      },
    ],
  }).compile();
  return { service: moduleRef.get(RacesService), chains };
}

describe('RacesService.resolveBatch', () => {
  it('answers each pair with the race id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: 'id:47' },
    ]);

    await expect(
      service.resolveBatch([
        { externalSystemId: 1, externalId: 'id:47' },
        { externalSystemId: 1, externalId: 'id:999' },
      ]),
    ).resolves.toEqual([{ found: true, id: 4 }, { found: false }]);
  });

  it('returns an empty array without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(service.resolveBatch([])).resolves.toEqual([]);
    expect(chains).toHaveLength(0);
  });
});

describe('RacesService.resolve', () => {
  it('answers a single pair with the race id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: 'id:47' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'id:47' }),
    ).resolves.toEqual({ found: true, id: 4 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'id:missing' }),
    ).resolves.toEqual({ found: false });
  });
});
