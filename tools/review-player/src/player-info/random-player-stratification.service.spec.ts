import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/review-harness/test-helpers';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { RandomPlayerStratificationService } from './random-player-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<RandomPlayerStratificationService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  // PlayerProjectionQueryService injects DB and issues a real query, so it
  // doesn't qualify for this repo's real-provider exemptions (module
  // composition specs, or a pure dependency-free formatter) — mock it and
  // hand back a chain sourced from the same mockDb helper used below, so the
  // `dbResult.chains` assertions still see exactly what this service issued.
  const query = mock<PlayerProjectionQueryService>();
  query.base.mockImplementation(() => dbResult.db.select() as never);
  const moduleRef = await Test.createTestingModule({
    providers: [
      RandomPlayerStratificationService,
      { provide: PlayerProjectionQueryService, useValue: query },
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(RandomPlayerStratificationService);
}

describe('RandomPlayerStratificationService', () => {
  it('offers one random-sample stratum covering both sources', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      { id: 'random', label: 'Random sample', sources: ['bbl', 'tp'] },
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

    const players = await service.sampleStratum({
      source: 'bbl',
      stratumId: 'random',
      limit: 3,
    });

    expect(players).toEqual([
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
      stratumId: 'random',
      limit: 5,
    });

    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ source: 'bbl', stratumId: 'nope', limit: 3 }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });

  it('excludes star player positions', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'random',
      limit: 3,
    });

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const { sql: rendered, params } = new PgDialect().sqlToQuery(condition);
    expect(rendered).toContain('"is_star_player"');
    // drizzle parameterizes the boolean, so the rendered SQL text alone is
    // identical for `true` and `false` — assert the bound value too, or a
    // regression that inverts the filter would leave this test green.
    expect(params).toEqual([false]);
  });
});
