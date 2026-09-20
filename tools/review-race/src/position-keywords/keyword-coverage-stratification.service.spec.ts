import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { KeywordCoverageStratificationService } from './keyword-coverage-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<KeywordCoverageStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      KeywordCoverageStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(KeywordCoverageStratificationService);
}

describe('KeywordCoverageStratificationService', () => {
  it('offers the two keyword-coverage strata verbatim', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'bb2025-position-without-keywords',
        label: 'Race has a BB2025 position with no keyword recorded',
        sources: ['tp', 'manual'],
      },
      {
        id: 'position-with-several-keywords',
        label: 'Race has a position carrying three or more keywords',
        sources: ['tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled races for bb2025-position-without-keywords', async () => {
    const service = await makeService(
      mockDb([{ raceId: 42, raceName: 'Dwarves' }]),
    );

    expect(
      await service.sampleStratum({
        stratumId: 'bb2025-position-without-keywords',
        limit: 3,
        source: 'tp',
      }),
    ).toEqual([{ raceId: 42, raceName: 'Dwarves' }]);
  });

  it('resolves BB2025 by rules-set name and filters on a missing keyword row', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'bb2025-position-without-keywords',
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

  it('returns the sampled races for position-with-several-keywords', async () => {
    const service = await makeService(
      mockDb([{ raceId: 42, raceName: 'Dwarves' }]),
    );

    expect(
      await service.sampleStratum({
        stratumId: 'position-with-several-keywords',
        limit: 5,
        source: 'manual',
      }),
    ).toEqual([{ raceId: 42, raceName: 'Dwarves' }]);
  });

  it('issues a count-based query for position-with-several-keywords', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'position-with-several-keywords',
      limit: 5,
      source: 'manual',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered.toLowerCase()).toContain('count');
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('rejects an unknown stratum id with the shared message', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'tp' }),
    ).rejects.toThrow(/Unknown race stratum "nope"/);
  });
});
