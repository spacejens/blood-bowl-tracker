import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { EligibilityMismatchStratificationService } from './eligibility-mismatch-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<EligibilityMismatchStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      EligibilityMismatchStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(EligibilityMismatchStratificationService);
}

describe('EligibilityMismatchStratificationService', () => {
  it('offers the eligibility-mismatch stratum verbatim', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'eligibility-mismatch',
        label:
          'Star player is hireable in an era whose rules set it has no characteristics for',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled star players', async () => {
    const service = await makeService(
      mockDb([{ positionId: 43, positionName: 'Morg N Thorg' }]),
    );

    const stars = await service.sampleStratum({
      stratumId: 'eligibility-mismatch',
      limit: 5,
      source: 'bbl',
    });

    expect(stars).toEqual([{ positionId: 43, positionName: 'Morg N Thorg' }]);
  });

  it('issues a left-join is-null query, orders randomly, and applies limit', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'eligibility-mismatch',
      limit: 5,
      source: 'bbl',
    });

    const whereCondition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(whereCondition).sql;
    expect(rendered.toLowerCase()).toContain('is null');
    expect(rendered).toContain('is_star_player');
    expect(dbResult.chains[0].leftJoin).toHaveBeenCalled();

    const orderByArg = dbResult.chains[0].orderBy.mock.calls[0][0] as SQL;
    const renderedOrderBy = new PgDialect().sqlToQuery(orderByArg).sql;
    expect(renderedOrderBy.toLowerCase()).toContain('random()');

    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown star player stratum "nope"/);
  });
});
