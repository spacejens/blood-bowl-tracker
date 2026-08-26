import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { SppMagnitudeStratificationService } from './spp-magnitude-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<SppMagnitudeStratificationService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  // PlayerProjectionQueryService injects DB and issues a real query, so it
  // doesn't qualify for this repo's real-provider exemptions — mock it and
  // hand back a chain sourced from the same mockDb helper used below, so the
  // `dbResult.chains` assertions still see exactly what this service issued.
  const query = mock<PlayerProjectionQueryService>();
  query.base.mockImplementation(() => dbResult.db.select() as never);
  const moduleRef = await Test.createTestingModule({
    providers: [
      SppMagnitudeStratificationService,
      { provide: PlayerProjectionQueryService, useValue: query },
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(SppMagnitudeStratificationService);
}

/** Render the `.where()` condition the service captured on its first query. */
function renderedWhere(dbResult: MockDbResult): {
  sql: string;
  params: unknown[];
} {
  const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
  return new PgDialect().sqlToQuery(condition);
}

describe('SppMagnitudeStratificationService', () => {
  it('offers the three magnitude strata, all covering both sources', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      { id: 'spp-zero', label: 'Zero SPP total', sources: ['bbl', 'tp'] },
      {
        id: 'spp-small',
        label: 'Small SPP total (1-20)',
        sources: ['bbl', 'tp'],
      },
      {
        id: 'spp-large',
        label: 'Large SPP total (100+)',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('returns the sampled players tagged with the requested source', async () => {
    const service = await makeService(
      mockDb([
        {
          playerId: 42,
          externalId: '1000',
          playerName: 'Janhorgh',
          teamName: 'Bockar',
          positionName: 'Lineman',
          eraName: 'Third Era',
        },
      ]),
    );

    expect(
      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'spp-zero',
        limit: 3,
      }),
    ).toEqual([
      {
        source: 'bbl',
        playerId: 42,
        externalId: '1000',
        playerName: 'Janhorgh',
        teamName: 'Bockar',
        positionName: 'Lineman',
        eraName: 'Third Era',
      },
    ]);
  });

  it('applies the requested limit to the query', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'tp',
      stratumId: 'spp-large',
      limit: 5,
    });

    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('filters the zero stratum on a stored total of exactly zero', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'spp-zero',
      limit: 3,
    });

    const { sql: rendered, params } = renderedWhere(dbResult);
    expect(rendered).toContain('"spp_total"');
    // drizzle parameterizes the bound number, so the rendered text alone
    // cannot tell 0 from any other threshold — assert the bound value too.
    expect(params).toEqual([0]);
  });

  it('filters the small stratum on 1..20 inclusive', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'spp-small',
      limit: 3,
    });

    const { sql: rendered, params } = renderedWhere(dbResult);
    expect(rendered).toContain('"spp_total"');
    expect(rendered).toMatch(/between/i);
    // 1..20 is the integer-column spelling of `0 < spp_total <= 20`; a
    // regression to 0..20 would silently merge the zero stratum into this one.
    expect(params).toEqual([1, 20]);
  });

  it('filters the large stratum on 100 or more', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'spp-large',
      limit: 3,
    });

    const { sql: rendered, params } = renderedWhere(dbResult);
    expect(rendered).toContain('"spp_total"');
    expect(rendered).toContain('>=');
    expect(params).toEqual([100]);
  });

  it('samples randomly rather than in a stable order', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'spp-zero',
      limit: 3,
    });

    const order = dbResult.chains[0].orderBy.mock.calls[0][0] as SQL;
    expect(new PgDialect().sqlToQuery(order).sql).toContain('random()');
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ source: 'bbl', stratumId: 'nope', limit: 3 }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
