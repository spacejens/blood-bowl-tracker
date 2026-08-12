import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SppForcedRateService } from './spp-forced-rate.service';

async function makeService(db: MockDbResult): Promise<SppForcedRateService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SppForcedRateService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(SppForcedRateService);
}

// Query order inside forcedRateSumsForPlayers:
//   0: per-player era/race context, 1: per (player, action type) event
//   groups, 2: the BB2020 award rows.
function db3(
  context: unknown[],
  events: unknown[],
  rates: unknown[],
): MockDbResult {
  return mockDb(context, events, rates);
}

const BB2020_MVP = { raceId: null, actionType: 'mvp_award', sppValue: 4 };
const BB2020_TOUCHDOWN = {
  raceId: null,
  actionType: 'touchdown',
  sppValue: 3,
};

describe('SppForcedRateService', () => {
  it('forces a pre-migration player’s events onto BB2020 rates', async () => {
    // Player 1 is in a CRP era: 2 MVPs stored at CRP’s rate of 5 (=10) and
    // 1 touchdown at 3. Forced onto BB2020: 2 * 4 + 1 * 3 = 11.
    const db = db3(
      [{ playerId: 1, raceId: 7, rulesSetName: 'CRP' }],
      [
        {
          playerId: 1,
          actionType: 'mvp_award',
          eventCount: 2,
          storedSum: '10',
        },
        {
          playerId: 1,
          actionType: 'touchdown',
          eventCount: 1,
          storedSum: '3',
        },
      ],
      [BB2020_MVP, BB2020_TOUCHDOWN],
    );
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([1])).toEqual(
      new Map([[1, 11]]),
    );
  });

  it('leaves a post-migration player’s stored values untouched', async () => {
    // DB2021 was never recalculated, so its own touchdown value of 5 stands
    // even though BB2020 says 3.
    const db = db3(
      [{ playerId: 1, raceId: 7, rulesSetName: 'DB2021' }],
      [
        {
          playerId: 1,
          actionType: 'touchdown',
          eventCount: 2,
          storedSum: '10',
        },
      ],
      [BB2020_TOUCHDOWN],
    );
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([1])).toEqual(
      new Map([[1, 10]]),
    );
  });

  it('treats an era listing any post-migration rules set as post-migration', async () => {
    const db = db3(
      [
        { playerId: 1, raceId: 7, rulesSetName: 'BB2016' },
        { playerId: 1, raceId: 7, rulesSetName: 'BB2025' },
      ],
      [{ playerId: 1, actionType: 'mvp_award', eventCount: 1, storedSum: '5' }],
      [BB2020_MVP],
    );
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([1])).toEqual(
      new Map([[1, 5]]),
    );
  });

  it('prefers a race-specific BB2020 award row over the baseline', async () => {
    const db = db3(
      [{ playerId: 1, raceId: 44, rulesSetName: 'CRP' }],
      [
        {
          playerId: 1,
          actionType: 'touchdown',
          eventCount: 2,
          storedSum: '6',
        },
      ],
      [BB2020_TOUCHDOWN, { raceId: 44, actionType: 'touchdown', sppValue: 2 }],
    );
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([1])).toEqual(
      new Map([[1, 4]]),
    );
  });

  it('falls back to the stored sum for an action type BB2020 has no row for', async () => {
    const db = db3(
      [{ playerId: 1, raceId: 7, rulesSetName: 'CRP' }],
      [
        {
          playerId: 1,
          actionType: 'interception',
          eventCount: 1,
          storedSum: '2',
        },
      ],
      [BB2020_MVP],
    );
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([1])).toEqual(
      new Map([[1, 2]]),
    );
  });

  it('returns 0 for a requested player with no events and for one with no era context', async () => {
    const db = db3([], [], [BB2020_MVP]);
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([1, 2])).toEqual(
      new Map([
        [1, 0],
        [2, 0],
      ]),
    );
  });

  it('issues no queries for an empty id list', async () => {
    const db = mockDb();
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([])).toEqual(new Map());
    expect(db.chains).toHaveLength(0);
  });

  it('filters every query to exactly the deduplicated requested players', async () => {
    const db = db3(
      [{ playerId: 1, raceId: 7, rulesSetName: 'CRP' }],
      [{ playerId: 1, actionType: 'mvp_award', eventCount: 1, storedSum: '5' }],
      [BB2020_MVP],
    );
    const service = await makeService(db);

    await service.forcedRateSumsForPlayers([1, 1, 2]);

    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      1, 2,
    ]);
    expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toContain(
      2,
    );
    expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
      'BB2020',
    ]);
  });
});
