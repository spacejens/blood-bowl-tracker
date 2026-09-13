import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { MercenaryVsEmbeddedStratificationService } from './mercenary-vs-embedded-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<MercenaryVsEmbeddedStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MercenaryVsEmbeddedStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(MercenaryVsEmbeddedStratificationService);
}

describe('MercenaryVsEmbeddedStratificationService', () => {
  it('offers the mercenary and roster-embedded strata in order', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'mercenary',
        label: 'Star player hireable by more than one race',
        sources: ['bbl', 'tp', 'manual'],
      },
      {
        id: 'roster-embedded',
        label: 'Star player hireable by exactly one race',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled star players', async () => {
    const service = await makeService(
      mockDb([{ positionId: 43, positionName: 'Morg N Thorg' }]),
    );

    const stars = await service.sampleStratum({
      stratumId: 'mercenary',
      limit: 5,
      source: 'bbl',
    });

    expect(stars).toEqual([{ positionId: 43, positionName: 'Morg N Thorg' }]);
  });

  it('renders a more-than-one-race having clause for mercenary, orders randomly, and applies limit', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'mercenary',
      limit: 5,
      source: 'bbl',
    });

    const havingCondition = dbResult.chains[0].having.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(havingCondition).sql;
    expect(rendered.toLowerCase()).toContain('count(distinct');
    expect(rendered).toContain('> 1');

    const orderByArg = dbResult.chains[0].orderBy.mock.calls[0][0] as SQL;
    const renderedOrderBy = new PgDialect().sqlToQuery(orderByArg).sql;
    expect(renderedOrderBy.toLowerCase()).toContain('random()');

    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('renders an exactly-one-race having clause for roster-embedded', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'roster-embedded',
      limit: 5,
      source: 'bbl',
    });

    const havingCondition = dbResult.chains[0].having.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(havingCondition).sql;
    expect(rendered.toLowerCase()).toContain('count(distinct');
    expect(rendered).toContain('= 1');
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown star player stratum "nope"/);
  });
});
