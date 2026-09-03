import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { RandomRaceStratificationService } from './random-race-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<RandomRaceStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RandomRaceStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(RandomRaceStratificationService);
}

describe('RandomRaceStratificationService', () => {
  it('offers one random-sample stratum covering all three sources', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'random',
        label: 'Random sample',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled races', async () => {
    const service = await makeService(
      mockDb([
        {
          raceId: 42,
          raceName: 'Dwarves',
        },
      ]),
    );

    const races = await service.sampleStratum({
      stratumId: 'random',
      limit: 3,
      source: 'bbl',
    });

    expect(races).toEqual([
      {
        raceId: 42,
        raceName: 'Dwarves',
      },
    ]);
  });

  it('applies the requested limit to the query', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'random',
      limit: 5,
      source: 'bbl',
    });

    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('orders by random, not newest-first', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'random',
      limit: 3,
      source: 'bbl',
    });

    const orderCall = dbResult.chains[0].orderBy.mock.calls[0][0] as SQL;
    const { sql: rendered } = new PgDialect().sqlToQuery(orderCall);
    expect(rendered).toContain('random()');
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown race stratum "nope"/);
  });
});
