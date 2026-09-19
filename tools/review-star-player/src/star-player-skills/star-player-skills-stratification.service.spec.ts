import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { StarPlayerSkillsStratificationService } from './star-player-skills-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<StarPlayerSkillsStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerSkillsStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(StarPlayerSkillsStratificationService);
}

describe('StarPlayerSkillsStratificationService', () => {
  it('offers the two star-skill strata verbatim', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'missing-skills',
        label:
          'Star player has a rules set with characteristics but no starting skills',
        sources: ['bbl', 'tp', 'manual'],
      },
      {
        id: 'no-unique-skill',
        label: 'Star player has no unique-category skill under any rules set',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled stars for missing-skills', async () => {
    const service = await makeService(
      mockDb([{ positionId: 42, positionName: 'Grombrindal' }]),
    );

    expect(
      await service.sampleStratum({
        stratumId: 'missing-skills',
        limit: 3,
        source: 'bbl',
      }),
    ).toEqual([{ positionId: 42, positionName: 'Grombrindal' }]);
  });

  it('issues a left-join is-null query for missing-skills', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'missing-skills',
      limit: 4,
      source: 'bbl',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered.toLowerCase()).toContain('is null');
    expect(rendered).toContain('is_star_player');
    expect(dbResult.chains[0].leftJoin).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(4);
  });

  it('filters on the unique category for no-unique-skill', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'no-unique-skill',
      limit: 2,
      source: 'tp',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered.toLowerCase()).toContain('not exists');
    expect(rendered).toContain('is_star_player');
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown star player stratum "nope"/);
  });
});
