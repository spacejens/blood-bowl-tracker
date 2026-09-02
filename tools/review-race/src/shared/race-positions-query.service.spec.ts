import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { RacePositionsQueryService } from './race-positions-query.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<RacePositionsQueryService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RacePositionsQueryService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(RacePositionsQueryService);
}

describe('RacePositionsQueryService', () => {
  it("returns the race's eras", async () => {
    const rows = [
      {
        eraId: 1,
        eraName: 'First era',
        startDate: '2010-01-01',
        endDate: null,
      },
    ];
    const service = await makeService(mockDb(rows));

    expect(await service.erasFor(7)).toEqual(rows);
  });

  it('binds the race id into the era query', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.erasFor(7);

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const { params } = new PgDialect().sqlToQuery(condition);
    expect(params).toEqual([7]);
  });

  it("returns the race's positions per era", async () => {
    const rows = [
      {
        positionId: 11,
        positionName: 'Dwarf Blitzer',
        isStarPlayer: false,
        eraId: 1,
        eraName: 'First era',
      },
    ];
    const service = await makeService(mockDb(rows));

    expect(await service.positionsFor(7)).toEqual(rows);
  });

  it("returns the distinct rules sets the race's eras map to", async () => {
    const rows = [
      {
        rulesSetId: 2,
        rulesSetName: 'CRP',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'bare',
        passingFormat: 'absent',
        armourFormat: 'bare',
      },
    ];
    const service = await makeService(mockDb(rows));

    expect(await service.rulesSetsFor(7)).toEqual(rows);
  });
});
