import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { EraAvailabilityStratificationService } from './era-availability-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<EraAvailabilityStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      EraAvailabilityStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(EraAvailabilityStratificationService);
}

describe('EraAvailabilityStratificationService', () => {
  it('offers legacy-only and modern-only strata', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'legacy-only',
        label: 'Race no longer available under modern rules sets',
        sources: ['bbl', 'tp', 'manual'],
      },
      {
        id: 'modern-only',
        label: 'Race only available under modern rules sets',
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled races for legacy-only', async () => {
    const service = await makeService(
      mockDb([
        {
          raceId: 42,
          raceName: 'Dwarves',
        },
      ]),
    );

    const races = await service.sampleStratum({
      stratumId: 'legacy-only',
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

  it('uses different having conditions for legacy-only vs modern-only', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'legacy-only',
      limit: 3,
      source: 'bbl',
    });
    const legacyHaving = dbResult.chains[0].having.mock.calls[0][0] as SQL;

    // Create a new dbResult for the second query
    const dbResult2 = mockDb([]);
    const service2 = await makeService(dbResult2);

    await service2.sampleStratum({
      stratumId: 'modern-only',
      limit: 3,
      source: 'bbl',
    });
    const modernHaving = dbResult2.chains[0].having.mock.calls[0][0] as SQL;

    const legacyRendered = new PgDialect().sqlToQuery(legacyHaving).sql;
    const modernRendered = new PgDialect().sqlToQuery(modernHaving).sql;

    expect(legacyRendered).toContain('passing_format');
    expect(modernRendered).toContain('passing_format');
    expect(legacyRendered).not.toEqual(modernRendered);
  });

  it('applies the requested limit to the query', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'legacy-only',
      limit: 5,
      source: 'bbl',
    });

    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown race stratum "nope"/);
  });
});
