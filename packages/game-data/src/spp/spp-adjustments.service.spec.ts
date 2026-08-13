import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SppAdjustmentsService } from './spp-adjustments.service';
import { SppForcedRateService } from './spp-forced-rate.service';
import { SppTotalsService } from './spp-totals.service';

interface Harness {
  service: SppAdjustmentsService;
  db: MockDbResult;
  totals: MockProxy<SppTotalsService>;
  forcedRate: MockProxy<SppForcedRateService>;
}

async function makeService(db: MockDbResult): Promise<Harness> {
  const totals = mock<SppTotalsService>();
  const forcedRate = mock<SppForcedRateService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      SppAdjustmentsService,
      { provide: DB, useValue: db.db },
      { provide: SppTotalsService, useValue: totals },
      { provide: SppForcedRateService, useValue: forcedRate },
    ],
  }).compile();
  return {
    service: moduleRef.get(SppAdjustmentsService),
    db,
    totals,
    forcedRate,
  };
}

/** The `set(...)` payload of each update, in call order. */
function writtenValues(db: MockDbResult, fromChain: number): unknown[] {
  return db.chains.slice(fromChain).map((chain) => firstCallArg(chain.set));
}

describe('SppAdjustmentsService.syncScrapedAdjustments', () => {
  it('stores the clamped gap and rebuilds spp_total from the era-correct sum', async () => {
    // Scraped 20, forced-rate replay explains 16 → adjustment 4; the
    // era-correct sum is 22, so spp_total becomes 26.
    const h = await makeService(mockDb([{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 22]]));
    h.forcedRate.forcedRateSumsForPlayers.mockResolvedValue(new Map([[1, 16]]));

    const result = await h.service.syncScrapedAdjustments({
      players: [{ playerId: 1, scrapedTotal: 20 }],
    });

    expect(result).toEqual({ updatedPlayerIds: [1] });
    expect(writtenValues(h.db, 0)).toEqual([
      { sppAdjustment: 4, sppTotal: 26 },
    ]);
  });

  it('clamps a negative gap to 0 rather than storing it', async () => {
    const h = await makeService(mockDb([{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 30]]));
    h.forcedRate.forcedRateSumsForPlayers.mockResolvedValue(new Map([[1, 25]]));

    await h.service.syncScrapedAdjustments({
      players: [{ playerId: 1, scrapedTotal: 20 }],
    });

    expect(writtenValues(h.db, 0)).toEqual([
      { sppAdjustment: 0, sppTotal: 30 },
    ]);
  });

  it('leaves the adjustment NULL when no total was scraped, still refreshing spp_total', async () => {
    const h = await makeService(mockDb([{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 9]]));
    h.forcedRate.forcedRateSumsForPlayers.mockResolvedValue(new Map([[1, 9]]));

    await h.service.syncScrapedAdjustments({
      players: [{ playerId: 1, scrapedTotal: null }],
    });

    expect(writtenValues(h.db, 0)).toEqual([
      { sppAdjustment: null, sppTotal: 9 },
    ]);
  });

  it('groups players sharing an adjustment and total into one update', async () => {
    const h = await makeService(mockDb([{ id: 1 }, { id: 2 }]));
    h.totals.totalsForPlayers.mockResolvedValue(
      new Map([
        [1, 10],
        [2, 10],
      ]),
    );
    h.forcedRate.forcedRateSumsForPlayers.mockResolvedValue(
      new Map([
        [1, 10],
        [2, 10],
      ]),
    );

    const result = await h.service.syncScrapedAdjustments({
      players: [
        { playerId: 1, scrapedTotal: 12 },
        { playerId: 2, scrapedTotal: 12 },
      ],
    });

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    expect(h.db.chains).toHaveLength(1);
    expect(extractAllFilterValues(firstCallArg(h.db.chains[0].where))).toEqual([
      1, 2,
    ]);
  });

  it('keeps the last entry for a repeated player id', async () => {
    const h = await makeService(mockDb([{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 0]]));
    h.forcedRate.forcedRateSumsForPlayers.mockResolvedValue(new Map([[1, 0]]));

    await h.service.syncScrapedAdjustments({
      players: [
        { playerId: 1, scrapedTotal: 3 },
        { playerId: 1, scrapedTotal: 7 },
      ],
    });

    expect(h.totals.totalsForPlayers).toHaveBeenCalledWith([1]);
    expect(writtenValues(h.db, 0)).toEqual([{ sppAdjustment: 7, sppTotal: 7 }]);
  });

  it('issues no query for an empty player list', async () => {
    const h = await makeService(mockDb());

    expect(await h.service.syncScrapedAdjustments({ players: [] })).toEqual({
      updatedPlayerIds: [],
    });
    expect(h.db.chains).toHaveLength(0);
    expect(h.totals.totalsForPlayers).not.toHaveBeenCalled();
  });

  it('issues every grouped update inside one transaction', async () => {
    // The write-back spans one UPDATE per distinct written value; they must
    // all land or none of them, so applyWrites runs them in a transaction.
    const h = await makeService(mockDb([{ id: 1 }], [{ id: 2 }]));
    h.totals.totalsForPlayers.mockResolvedValue(
      new Map([
        [1, 10],
        [2, 10],
      ]),
    );
    h.forcedRate.forcedRateSumsForPlayers.mockResolvedValue(
      new Map([
        [1, 10],
        [2, 10],
      ]),
    );

    const result = await h.service.syncScrapedAdjustments({
      players: [
        { playerId: 1, scrapedTotal: 12 },
        { playerId: 2, scrapedTotal: 15 },
      ],
    });

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    expect(h.db.transaction).toHaveBeenCalledTimes(1);
    // Both distinct writes were issued, and only from inside the callback.
    expect(h.db.chains).toHaveLength(2);
  });

  it('propagates a failing transaction rather than reporting a partial write', async () => {
    const h = await makeService(mockDb([{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 10]]));
    h.forcedRate.forcedRateSumsForPlayers.mockResolvedValue(new Map([[1, 10]]));
    h.db.transaction.mockRejectedValue(new Error('connection lost'));

    await expect(
      h.service.syncScrapedAdjustments({
        players: [{ playerId: 1, scrapedTotal: 12 }],
      }),
    ).rejects.toThrow('connection lost');
  });

  it('treats a player missing from either sum map as contributing 0', async () => {
    // Neither map has an entry for player 1, exercising the `?? 0`
    // fallbacks for both the era-correct sum and the forced-rate sum.
    const h = await makeService(mockDb([{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map());
    h.forcedRate.forcedRateSumsForPlayers.mockResolvedValue(new Map());

    await h.service.syncScrapedAdjustments({
      players: [{ playerId: 1, scrapedTotal: 5 }],
    });

    expect(writtenValues(h.db, 0)).toEqual([{ sppAdjustment: 5, sppTotal: 5 }]);
  });
});

describe('SppAdjustmentsService.syncReportedAdjustments', () => {
  it('stores the clamped gap between the reported total and the event sum', async () => {
    // query 0: the reported totals select; query 1: the update.
    const h = await makeService(mockDb([{ id: 1, sppTotal: 20 }], [{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 17]]));

    const result = await h.service.syncReportedAdjustments({
      players: [{ playerId: 1 }],
    });

    expect(result).toEqual({ updatedPlayerIds: [1] });
    expect(writtenValues(h.db, 1)).toEqual([{ sppAdjustment: 3 }]);
  });

  it('never writes spp_total for a TP player', async () => {
    const h = await makeService(mockDb([{ id: 1, sppTotal: 20 }], [{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 17]]));

    await h.service.syncReportedAdjustments({ players: [{ playerId: 1 }] });

    expect(firstCallArg(h.db.chains[1].set)).not.toHaveProperty('sppTotal');
  });

  it('clamps a reported total below the event sum to 0', async () => {
    const h = await makeService(mockDb([{ id: 1, sppTotal: 10 }], [{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 17]]));

    await h.service.syncReportedAdjustments({ players: [{ playerId: 1 }] });

    expect(writtenValues(h.db, 1)).toEqual([{ sppAdjustment: 0 }]);
  });

  it('skips players with no reported total', async () => {
    // The select filters spp_total IS NOT NULL, so player 2 comes back with
    // no row and is never updated.
    const h = await makeService(mockDb([{ id: 1, sppTotal: 5 }], [{ id: 1 }]));
    h.totals.totalsForPlayers.mockResolvedValue(new Map([[1, 5]]));

    const result = await h.service.syncReportedAdjustments({
      players: [{ playerId: 1 }, { playerId: 2 }],
    });

    expect(result).toEqual({ updatedPlayerIds: [1] });
    expect(h.totals.totalsForPlayers).toHaveBeenCalledWith([1]);
  });

  it('returns early when none of the requested players has a reported total', async () => {
    const h = await makeService(mockDb([]));

    const result = await h.service.syncReportedAdjustments({
      players: [{ playerId: 1 }],
    });

    expect(result).toEqual({ updatedPlayerIds: [] });
    expect(h.db.chains).toHaveLength(1);
    expect(h.totals.totalsForPlayers).not.toHaveBeenCalled();
  });

  it('groups players sharing an adjustment into one update', async () => {
    const h = await makeService(
      mockDb(
        [
          { id: 1, sppTotal: 8 },
          { id: 2, sppTotal: 9 },
        ],
        [{ id: 1 }, { id: 2 }],
      ),
    );
    h.totals.totalsForPlayers.mockResolvedValue(
      new Map([
        [1, 6],
        [2, 7],
      ]),
    );

    const result = await h.service.syncReportedAdjustments({
      players: [{ playerId: 1 }, { playerId: 2 }],
    });

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    expect(h.db.chains).toHaveLength(2);
    expect(writtenValues(h.db, 1)).toEqual([{ sppAdjustment: 2 }]);
    expect(h.db.transaction).toHaveBeenCalledTimes(1);
  });

  it('issues no query for an empty id list', async () => {
    const h = await makeService(mockDb());

    expect(await h.service.syncReportedAdjustments({ players: [] })).toEqual({
      updatedPlayerIds: [],
    });
    expect(h.db.chains).toHaveLength(0);
  });

  it('treats a null reported total and a missing event sum as 0', async () => {
    // The isNotNull filter is mocked away, so this exercises the defensive
    // `?? 0` fallbacks for both row.sppTotal and the missing map entry.
    const h = await makeService(
      mockDb([{ id: 1, sppTotal: null }], [{ id: 1 }]),
    );
    h.totals.totalsForPlayers.mockResolvedValue(new Map());

    await h.service.syncReportedAdjustments({ players: [{ playerId: 1 }] });

    expect(writtenValues(h.db, 1)).toEqual([{ sppAdjustment: 0 }]);
  });
});
