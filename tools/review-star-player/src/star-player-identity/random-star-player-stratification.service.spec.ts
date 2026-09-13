import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { RandomStarPlayerStratificationService } from './random-star-player-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<RandomStarPlayerStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RandomStarPlayerStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(RandomStarPlayerStratificationService);
}

describe('RandomStarPlayerStratificationService', () => {
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

  it('returns the sampled star players', async () => {
    const service = await makeService(
      mockDb([
        {
          positionId: 42,
          positionName: 'Griff Oberwald',
        },
      ]),
    );

    const stars = await service.sampleStratum({
      stratumId: 'random',
      limit: 3,
      source: 'bbl',
    });

    expect(stars).toEqual([
      {
        positionId: 42,
        positionName: 'Griff Oberwald',
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

  it('filters to star player positions', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'random',
      limit: 3,
      source: 'bbl',
    });

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const { sql: rendered, params } = new PgDialect().sqlToQuery(condition);
    expect(rendered).toContain('is_star_player');
    expect(params).toEqual([true]);
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown star player stratum "nope"/);
  });
});
