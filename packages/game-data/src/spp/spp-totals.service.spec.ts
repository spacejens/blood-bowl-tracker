import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SppTotalsService } from './spp-totals.service';

async function makeService(db: MockDbResult): Promise<SppTotalsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SppTotalsService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(SppTotalsService);
}

describe('SppTotalsService', () => {
  it('sums spp_value over the events the player acted in', async () => {
    const db = mockDb([{ total: '17' }]);
    const service = await makeService(db);

    const total = await service.totalForPlayer(9);

    expect(total).toBe(17);
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toContain(
      9,
    );
  });

  it('returns 0 when the player has no SPP-bearing events', async () => {
    const db = mockDb([{ total: null }]);
    const service = await makeService(db);

    expect(await service.totalForPlayer(9)).toBe(0);
  });

  it('returns 0 when the query returns no row at all', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    expect(await service.totalForPlayer(9)).toBe(0);
  });
});

describe('SppTotalsService.totalsForPlayers', () => {
  it('returns each requested player their own grouped sum', async () => {
    const db = mockDb([
      { playerId: 1, total: '17' },
      { playerId: 2, total: '4' },
    ]);
    const service = await makeService(db);

    const totals = await service.totalsForPlayers([1, 2]);

    expect(totals).toEqual(
      new Map([
        [1, 17],
        [2, 4],
      ]),
    );
  });

  it('fills in 0 for a requested player with no rows and for a NULL sum', async () => {
    const db = mockDb([{ playerId: 1, total: null }]);
    const service = await makeService(db);

    const totals = await service.totalsForPlayers([1, 2]);

    expect(totals).toEqual(
      new Map([
        [1, 0],
        [2, 0],
      ]),
    );
  });

  it('issues no query and returns an empty map for an empty id list', async () => {
    const db = mockDb();
    const service = await makeService(db);

    expect(await service.totalsForPlayers([])).toEqual(new Map());
    expect(db.chains).toHaveLength(0);
  });

  it('deduplicates the requested ids before querying', async () => {
    const db = mockDb([{ playerId: 1, total: '3' }]);
    const service = await makeService(db);

    await service.totalsForPlayers([1, 1, 2]);

    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      1, 2,
    ]);
  });
});
