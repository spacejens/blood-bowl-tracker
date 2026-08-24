import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { is, SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { SppTotalsService } from './spp-totals.service';

async function makeService(db: MockDbResult): Promise<SppTotalsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      SppTotalsService,
      MatchScopeFilterService,
      { provide: DB, useValue: db.db },
    ],
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

describe('SppTotalsService.topPlayersBySppSum', () => {
  it('returns the grouped rows the query resolves to, capped to the limit', async () => {
    const rows = [
      { playerId: 1, name: 'Griff Oberwald', count: 42 },
      { playerId: 2, name: 'Morg n Thorg', count: 17 },
    ];
    const db = mockDb(rows);
    const service = await makeService(db);

    await expect(
      service.topPlayersBySppSum({ competitionId: 30 }, 21),
    ).resolves.toEqual(rows);
    expect(db.chains[0].limit).toHaveBeenCalledWith(21);
    expect(db.chains[0].groupBy).toHaveBeenCalledTimes(1);
  });

  it('filters by competition and applies no action-type restriction', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    await service.topPlayersBySppSum({ competitionId: 30 }, 21);

    // Only the competition id: SPP-earning events are not one fixed type set,
    // so unlike every count* query there is no inArray(actionType, ...) here.
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      30,
      false,
    ]);
  });

  it('filters by match category', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    await service.topPlayersBySppSum({ category: 'season_final' }, 21);

    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      'season_final',
      false,
    ]);
  });

  it('excludes players whose scoped sum is zero via HAVING', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    await service.topPlayersBySppSum({ competitionId: 30 }, 21);

    expect(db.chains[0].having).toHaveBeenCalledTimes(1);
    // ne(sqlExpr, 0) inlines the literal 0 as a raw SQL chunk rather than a
    // Param (drizzle only parameterizes comparisons against a Column), so
    // extractAllFilterValues (which only recognizes Param) can't see it —
    // walk the condition's own queryChunks for the raw literal instead.
    const condition = firstCallArg(db.chains[0].having);
    expect(is(condition, SQL)).toBe(true);
    expect((condition as SQL).queryChunks).toContainEqual(0);
  });

  it('orders by the summed SPP, most first', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    await service.topPlayersBySppSum({ competitionId: 30 }, 21);

    expect(db.chains[0].orderBy).toHaveBeenCalledTimes(1);
    const orderBy = sqlText(firstCallArg(db.chains[0].orderBy));
    expect(orderBy).toContain('coalesce(sum(');
    expect(orderBy).toContain(' desc');
  });

  it('joins the acting side of the event through to matches and eras', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    await service.topPlayersBySppSum({ competitionId: 30 }, 21);

    expect(db.chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(
      extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 0, 1)),
    ).toEqual(['players.id', 'match_events.acting_player_id']);
    expect(
      extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 1, 1)),
    ).toEqual(['match_teams.id', 'match_events.acting_match_team_id']);
  });

  it('excludes star players from the scoped ranking', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    await service.topPlayersBySppSum({ competitionId: 30 }, 21);

    expect(db.chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(
      extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 5, 1)),
    ).toEqual(['positions.id', 'players.position_id']);
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      30,
      false,
    ]);
  });
});
