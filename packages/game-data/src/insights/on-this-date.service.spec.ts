import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { PlayerDeathService } from '../players/player-death.service';
import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { OnThisDateService } from './on-this-date.service';

describe('OnThisDateService', () => {
  let service: OnThisDateService;
  let playerDeath: MockProxy<PlayerDeathService>;

  const LEAP_DAY = { month: 2, day: 29 };

  const SIMPLE_LABELS = [
    'Touchdowns scored',
    'Completions',
    'Interceptions',
    'Deflections',
    'Team-mates thrown',
    'Successful catches',
  ];

  const victimRow = {
    playerId: 88,
    name: 'Griff Oberwald',
    sppTotal: 120,
    positionId: 60,
    positionName: 'Blitzer',
    isStarPlayer: false,
    teamId: 11,
    teamName: 'Reikland Reavers',
    raceId: 4,
    raceName: 'Human',
    coachId: 21,
    coachName: 'Bob',
  };

  const teamKiller = {
    kind: 'team' as const,
    teamId: 12,
    teamName: 'Gouged Eye',
    raceId: 5,
    raceName: 'Orc',
    coachId: 22,
    coachName: 'Grimly',
    viaFoul: false,
  };

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    playerDeath = mock<PlayerDeathService>();
    playerDeath.getKillerInfo.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OnThisDateService,
        MatchScopeFilterService,
        { provide: DB, useValue: db },
        { provide: PlayerDeathService, useValue: playerDeath },
      ],
    }).compile();
    service = moduleRef.get(OnThisDateService);
    return { db, chains };
  }

  function countRows(...counts: number[]): unknown[][] {
    return counts.map((value) => [{ count: value }]);
  }

  describe('countMatchesPlayed', () => {
    it('resolves to the single row count', async () => {
      await build([{ count: 3 }]);
      await expect(
        service.countMatchesPlayed({
          month: 6,
          day: 1,
          scope: { leagueId: 9 },
        }),
      ).resolves.toBe(3);
    });

    it('matches calendar fields, not a nearest-date fold', async () => {
      const { chains } = await build([{ count: 1 }]);
      await service.countMatchesPlayed({
        ...LEAP_DAY,
        scope: { leagueId: 9 },
      });
      const whereText = sqlText(firstCallArg(chains[0].where));
      expect(whereText).toContain('month from');
      expect(whereText).toContain('day from');
      const values = extractAllFilterValues(firstCallArg(chains[0].where));
      expect(values).toContain(2);
      expect(values).toContain(29);
    });

    it('joins three tables so a scope can narrow it', async () => {
      const { chains } = await build([{ count: 1 }]);
      await service.countMatchesPlayed({
        month: 6,
        day: 1,
        scope: { leagueId: 9 },
      });
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'matches.id']);
    });

    it('filters by leagueId with month and day', async () => {
      const { chains } = await build([{ count: 1 }]);
      await service.countMatchesPlayed({
        month: 6,
        day: 1,
        scope: { leagueId: 9 },
      });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9, 6, 1,
      ]);
    });

    it('filters by eraId with month and day', async () => {
      const { chains } = await build([{ count: 1 }]);
      await service.countMatchesPlayed({
        month: 6,
        day: 1,
        scope: { eraId: 7 },
      });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        7, 6, 1,
      ]);
    });

    it('filters by competitionId with month and day', async () => {
      const { chains } = await build([{ count: 1 }]);
      await service.countMatchesPlayed({
        month: 6,
        day: 1,
        scope: { competitionId: 5 },
      });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        5, 6, 1,
      ]);
    });

    it('filters by category with month and day', async () => {
      const { chains } = await build([{ count: 1 }]);
      await service.countMatchesPlayed({
        month: 6,
        day: 1,
        scope: { category: 'season_final' },
      });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'season_final',
        6,
        1,
      ]);
    });
  });

  describe('getEventCounts', () => {
    it('reports twelve counters in the deepdive shape', async () => {
      const { db } = await build(
        ...countRows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
      );
      const counts = await service.getEventCounts({
        month: 6,
        day: 1,
        scope: { leagueId: 9 },
      });
      expect(counts.simple.map((row) => row.label)).toEqual(SIMPLE_LABELS);
      expect(counts.simple.map((row) => row.count)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(counts.casualties).toEqual({
        total: 7,
        seriousInjuries: 8,
        killed: 9,
      });
      expect(counts.fouls).toEqual({
        total: 10,
        seriousInjuries: 11,
        killed: 12,
      });
      expect(db.select).toHaveBeenCalledTimes(12);
    });

    it('never counts MVP awards', async () => {
      const { chains } = await build(
        ...countRows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
      );
      await service.getEventCounts({
        month: 6,
        day: 1,
        scope: { leagueId: 9 },
      });
      const allFilterValues = chains.flatMap((chain) =>
        extractAllFilterValues(firstCallArg(chain.where)),
      );
      expect(allFilterValues).not.toContain('mvp_award');
    });

    it('applies the date and scope to every counter', async () => {
      const { chains } = await build(
        ...countRows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
      );
      await service.getEventCounts({
        month: 6,
        day: 1,
        scope: { eraId: 7 },
      });
      for (const chain of chains) {
        const whereText = sqlText(firstCallArg(chain.where));
        expect(whereText).toContain('month from');
        expect(whereText).toContain('day from');
        expect(extractAllFilterValues(firstCallArg(chain.where))).toContain(7);
        expect(extractAllFilterValues(firstCallArg(chain.where))).toContain(6);
        expect(extractAllFilterValues(firstCallArg(chain.where))).toContain(1);
      }
    });

    it('counts a death whose consequence was never recorded', async () => {
      const { chains } = await build(
        ...countRows(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
      );
      await service.getEventCounts({
        month: 6,
        day: 1,
        scope: { leagueId: 9 },
      });
      const whereText = sqlText(firstCallArg(chains[8].where));
      expect(whereText).toContain('is null');
    });
  });

  describe('getTopKilledPlayers', () => {
    it('orders by SPP descending with a coalesced total', async () => {
      const { chains } = await build([victimRow]);
      await service.getTopKilledPlayers({
        month: 2,
        day: 29,
        scope: { leagueId: 9 },
        limit: 21,
      });
      const orderByText = sqlText(firstCallArg(chains[0].orderBy));
      expect(orderByText).toContain('coalesce');
      expect(orderByText).toContain('desc');
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('selects only confirmed death consequences', async () => {
      const { chains } = await build([victimRow]);
      await service.getTopKilledPlayers({
        ...LEAP_DAY,
        scope: {},
        limit: 21,
      });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'death',
        2,
        29,
      ]);
    });

    it('pairs each victim with the resolved killer', async () => {
      await build([victimRow]);
      playerDeath.getKillerInfo.mockResolvedValue(teamKiller);
      const result = await service.getTopKilledPlayers({
        month: 2,
        day: 29,
        scope: { leagueId: 9 },
        limit: 21,
      });
      expect(playerDeath.getKillerInfo).toHaveBeenCalledWith(88);
      expect(result[0]).toEqual({ ...victimRow, killer: teamKiller });
    });

    it('keeps a victim whose killer cannot be resolved', async () => {
      await build([victimRow]);
      const result = await service.getTopKilledPlayers({
        month: 2,
        day: 29,
        scope: { leagueId: 9 },
        limit: 21,
      });
      expect(result[0]).toEqual({ ...victimRow, killer: null });
    });

    it('asks for no killers when nobody died', async () => {
      await build([]);
      const result = await service.getTopKilledPlayers({
        month: 2,
        day: 29,
        scope: { leagueId: 9 },
        limit: 21,
      });
      expect(result).toEqual([]);
      expect(playerDeath.getKillerInfo).not.toHaveBeenCalled();
    });
  });
});
