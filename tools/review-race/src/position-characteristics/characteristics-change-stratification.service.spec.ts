import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<CharacteristicsChangeStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CharacteristicsChangeStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(CharacteristicsChangeStratificationService);
}

describe('CharacteristicsChangeStratificationService', () => {
  it('offers the characteristics-changed and missing-characteristics strata verbatim', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'characteristics-changed',
        label:
          'Race has a position whose characteristics changed between rules sets',
        sources: ['bbl', 'tp', 'manual'],
      },
      {
        id: 'missing-characteristics',
        label:
          'Race has a position missing characteristics for a rules set it should have',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled races for characteristics-changed', async () => {
    const service = await makeService(
      mockDb([{ raceId: 42, raceName: 'Dwarves' }]),
    );

    const races = await service.sampleStratum({
      stratumId: 'characteristics-changed',
      limit: 3,
      source: 'bbl',
    });

    expect(races).toEqual([{ raceId: 42, raceName: 'Dwarves' }]);
  });

  it('returns the sampled races for missing-characteristics', async () => {
    const service = await makeService(
      mockDb([{ raceId: 43, raceName: 'Orcs' }]),
    );

    const races = await service.sampleStratum({
      stratumId: 'missing-characteristics',
      limit: 3,
      source: 'bbl',
    });

    expect(races).toEqual([{ raceId: 43, raceName: 'Orcs' }]);
  });

  it('issues a self-join query for characteristics-changed comparing all five characteristics', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'characteristics-changed',
      limit: 3,
      source: 'bbl',
    });

    const whereCondition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(whereCondition).sql;
    expect(rendered).toContain('move');
    expect(rendered).toContain('strength');
    expect(rendered).toContain('agility');
    expect(rendered).toContain('armour');
    expect(rendered.toLowerCase()).toContain('is distinct from');
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(3);
    expect(dbResult.chains[0].orderBy).toHaveBeenCalled();
  });

  it('issues a left-join is-null query for missing-characteristics', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'missing-characteristics',
      limit: 5,
      source: 'bbl',
    });

    const whereCondition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(whereCondition).sql;
    expect(rendered.toLowerCase()).toContain('is null');
    expect(dbResult.chains[0].leftJoin).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('maps rows to { raceId, raceName } for both strata', async () => {
    const service = await makeService(
      mockDb([{ raceId: 1, raceName: 'Human' }]),
    );

    expect(
      await service.sampleStratum({
        stratumId: 'characteristics-changed',
        limit: 1,
        source: 'bbl',
      }),
    ).toEqual([{ raceId: 1, raceName: 'Human' }]);
  });

  it('rejects an unknown stratum id with the shared message', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown race stratum "nope"/);
  });
});
