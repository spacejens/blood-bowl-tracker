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

describe('SppTotalsService.syncComputedTotals', () => {
  it('writes each player their own grouped sum', async () => {
    // query 0: the grouped select; queries 1..n: one update per distinct
    // total value.
    const db = mockDb(
      [
        { playerId: 1, total: '17' },
        { playerId: 2, total: '4' },
      ],
      [{ id: 1 }],
      [{ id: 2 }],
    );
    const service = await makeService(db);

    const result = await service.syncComputedTotals({ playerIds: [1, 2] });

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    const written = db.chains
      .slice(1)
      .map((chain) => firstCallArg(chain.set) as { sppTotal: number });
    expect(written).toEqual([{ sppTotal: 17 }, { sppTotal: 4 }]);
  });

  it('writes 0 for a player with no SPP-earning events', async () => {
    // The grouped select returns no row at all for player 2.
    const db = mockDb([{ playerId: 1, total: '9' }], [{ id: 1 }], [{ id: 2 }]);
    const service = await makeService(db);

    const result = await service.syncComputedTotals({ playerIds: [1, 2] });

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    const zeroUpdate = db.chains
      .slice(1)
      .find(
        (chain) =>
          (firstCallArg(chain.set) as { sppTotal: number }).sppTotal === 0,
      );
    expect(zeroUpdate).toBeDefined();
    expect(extractAllFilterValues(firstCallArg(zeroUpdate!.where))).toContain(
      2,
    );
  });

  it('writes 0 for a player whose group row has a SQL NULL total', async () => {
    // Unlike the no-row case above, here the grouped select returns a row
    // for the player (they acted in at least one match event), but every
    // one of those events has a NULL spp_value (e.g. only fouls, which earn
    // no SPP) -- SUM() over an all-NULL group is SQL NULL, not 0.
    const db = mockDb([{ playerId: 1, total: null }], [{ id: 1 }]);
    const service = await makeService(db);

    const result = await service.syncComputedTotals({ playerIds: [1] });

    expect(result).toEqual({ updatedPlayerIds: [1] });
    expect(firstCallArg(db.chains[1].set)).toEqual({ sppTotal: 0 });
  });

  it('groups players sharing a total into a single update', async () => {
    const db = mockDb(
      [
        { playerId: 1, total: '5' },
        { playerId: 2, total: '5' },
      ],
      [{ id: 1 }, { id: 2 }],
    );
    const service = await makeService(db);

    const result = await service.syncComputedTotals({ playerIds: [1, 2] });

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    // One select + exactly one update.
    expect(db.chains).toHaveLength(2);
    expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
      1, 2,
    ]);
  });

  it('sets an absolute total rather than an increment, so re-running is idempotent', async () => {
    const db = mockDb([{ playerId: 1, total: '17' }], [{ id: 1 }]);
    const service = await makeService(db);

    await service.syncComputedTotals({ playerIds: [1] });

    expect(firstCallArg(db.chains[1].set)).toEqual({ sppTotal: 17 });
  });

  it('filters the grouped select to exactly the requested players', async () => {
    const db = mockDb([{ playerId: 1, total: '3' }], [{ id: 1 }]);
    const service = await makeService(db);

    await service.syncComputedTotals({ playerIds: [1, 2, 3] });

    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      1, 2, 3,
    ]);
  });

  it('issues no queries and returns an empty result for an empty player list', async () => {
    const db = mockDb();
    const service = await makeService(db);

    expect(await service.syncComputedTotals({ playerIds: [] })).toEqual({
      updatedPlayerIds: [],
    });
    expect(db.chains).toHaveLength(0);
  });

  it('reports only the ids the update actually wrote', async () => {
    // Player 2 no longer exists, so the UPDATE ... RETURNING yields only 1.
    const db = mockDb(
      [
        { playerId: 1, total: '5' },
        { playerId: 2, total: '5' },
      ],
      [{ id: 1 }],
    );
    const service = await makeService(db);

    expect(await service.syncComputedTotals({ playerIds: [1, 2] })).toEqual({
      updatedPlayerIds: [1],
    });
  });
});
