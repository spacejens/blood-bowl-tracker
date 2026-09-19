import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { StartingSkillsStratificationService } from './starting-skills-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<StartingSkillsStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StartingSkillsStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(StartingSkillsStratificationService);
}

describe('StartingSkillsStratificationService', () => {
  it('offers the two starting-skill strata verbatim', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'starting-skills-changed',
        label:
          'Race has a position whose starting skills changed between rules sets',
        sources: ['bbl', 'tp', 'manual'],
      },
      {
        id: 'starting-skill-not-in-rules-set',
        label:
          'Race has a position with a starting skill that rules set does not have',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled races for starting-skills-changed', async () => {
    const service = await makeService(
      mockDb([{ raceId: 42, raceName: 'Dwarves' }]),
    );

    expect(
      await service.sampleStratum({
        stratumId: 'starting-skills-changed',
        limit: 3,
        source: 'bbl',
      }),
    ).toEqual([{ raceId: 42, raceName: 'Dwarves' }]);
  });

  it("compares the two rules sets' skill id sets for starting-skills-changed", async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'starting-skills-changed',
      limit: 3,
      source: 'bbl',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered).toContain('array_agg');
    expect(rendered.toLowerCase()).toContain('is distinct from');
    expect(rendered).toContain('is_star_player');
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(3);
  });

  it('issues a left-join is-null query for starting-skill-not-in-rules-set', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'starting-skill-not-in-rules-set',
      limit: 5,
      source: 'tp',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered.toLowerCase()).toContain('is null');
    expect(dbResult.chains[0].leftJoin).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('rejects an unknown stratum id with the shared message', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown race stratum "nope"/);
  });
});
