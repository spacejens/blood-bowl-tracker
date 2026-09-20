import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { StarPlayerKeywordsStratificationService } from './star-player-keywords-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<StarPlayerKeywordsStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerKeywordsStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(StarPlayerKeywordsStratificationService);
}

describe('StarPlayerKeywordsStratificationService', () => {
  it('offers the one keyword-coverage stratum verbatim', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'bb2025-star-without-keywords',
        label: 'Star player with no keyword recorded under BB2025',
        sources: ['tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled star players for bb2025-star-without-keywords', async () => {
    const service = await makeService(
      mockDb([{ positionId: 42, positionName: 'Grombrindal' }]),
    );

    expect(
      await service.sampleStratum({
        stratumId: 'bb2025-star-without-keywords',
        limit: 3,
        source: 'tp',
      }),
    ).toEqual([{ positionId: 42, positionName: 'Grombrindal' }]);
  });

  it('resolves BB2025 by rules-set name and filters on a missing keyword row', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'bb2025-star-without-keywords',
      limit: 3,
      source: 'tp',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered.toLowerCase()).toContain('is null');
    expect(dbResult.chains[0].leftJoin).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(3);
    const params = new PgDialect().sqlToQuery(where).params;
    expect(params).toContain('BB2025');
  });

  it('rejects an unknown stratum id with the shared message', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'tp' }),
    ).rejects.toThrow(/Unknown star player stratum "nope"/);
  });
});
