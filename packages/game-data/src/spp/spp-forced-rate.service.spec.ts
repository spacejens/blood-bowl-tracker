import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

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

  it('keeps a player’s stored sum unchanged when no era context resolves, unlike the no-events case', async () => {
    // Player 1 has an mvp_award event group but no context row at all, so
    // playerContext is undefined. That must NOT be treated as "0 events":
    // the stored sum is kept unchanged, the same as an unmodelled action
    // type would be.
    const db = db3(
      [],
      [{ playerId: 1, actionType: 'mvp_award', eventCount: 1, storedSum: '5' }],
      [BB2020_MVP],
    );
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([1])).toEqual(
      new Map([[1, 5]]),
    );
  });

  it('falls back to an earlier context row’s race when a later row has a null race', async () => {
    // Player 1 has two CRP-era context rows: the first carries the real
    // race id (44), the second's race id is null. The second row must fall
    // back to the first's already-resolved race rather than clobbering it
    // with null. Proven by the final sum using race 44's rate (2), not the
    // baseline rate (3): 2 touchdowns * 2 = 4, not 2 * 3 = 6.
    const db = db3(
      [
        { playerId: 1, raceId: 44, rulesSetName: 'CRP' },
        { playerId: 1, raceId: null, rulesSetName: 'CRP' },
      ],
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

  it('treats a null stored sum as 0 when no BB2020 rate applies', async () => {
    // Player 1 is pre-migration (CRP) with an event-group row whose
    // aggregate storedSum is null (drizzle's sum() returns null when it has
    // nothing to sum). BB2020 has no rate for 'interception', so the code
    // falls back to the group's stored sum — which must resolve to 0, not
    // null, or the total would be NaN/invalid.
    const db = db3(
      [{ playerId: 1, raceId: 7, rulesSetName: 'CRP' }],
      [
        {
          playerId: 1,
          actionType: 'interception',
          eventCount: 1,
          storedSum: null,
        },
      ],
      [BB2020_MVP],
    );
    const service = await makeService(db);

    expect(await service.forcedRateSumsForPlayers([1])).toEqual(
      new Map([[1, 0]]),
    );
  });

  it('falls back to the baseline BB2020 rate when the player’s resolved race is null', async () => {
    // Player 1's team has no race (raceId: null), so despite a
    // race-specific BB2020 touchdown rate existing (for race 44), the
    // baseline rate (3) must be used: 2 * 3 = 6, not 2 * 2 = 4.
    const db = db3(
      [{ playerId: 1, raceId: null, rulesSetName: 'CRP' }],
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
      new Map([[1, 6]]),
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
