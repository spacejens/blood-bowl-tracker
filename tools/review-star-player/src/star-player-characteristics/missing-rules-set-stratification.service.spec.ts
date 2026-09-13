import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { MissingRulesSetStratificationService } from './missing-rules-set-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<MissingRulesSetStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MissingRulesSetStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(MissingRulesSetStratificationService);
}

describe('MissingRulesSetStratificationService', () => {
  it('offers the missing-rules-set stratum verbatim', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'missing-rules-set',
        label:
          'Star player is missing characteristics for a rules set it is hireable under',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled star players', async () => {
    const service = await makeService(
      mockDb([{ positionId: 43, positionName: 'Morg N Thorg' }]),
    );

    const stars = await service.sampleStratum({
      stratumId: 'missing-rules-set',
      limit: 5,
      source: 'bbl',
    });

    expect(stars).toEqual([{ positionId: 43, positionName: 'Morg N Thorg' }]);
  });

  it('issues a left-join is-null query and applies limit', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'missing-rules-set',
      limit: 5,
      source: 'bbl',
    });

    const whereCondition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(whereCondition).sql;
    expect(rendered.toLowerCase()).toContain('is null');
    expect(rendered).toContain('is_star_player');
    expect(dbResult.chains[0].leftJoin).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown star player stratum "nope"/);
  });
});
