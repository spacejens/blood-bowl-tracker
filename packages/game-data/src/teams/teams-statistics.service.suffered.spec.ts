import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TeamsStatisticsService } from './teams-statistics.service';

describe('TeamsStatisticsService (suffered consequences & expensive mistakes)', () => {
  let service: TeamsStatisticsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [TeamsStatisticsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(TeamsStatisticsService);
    return { db, chains };
  }

  describe('toplist queries', () => {
    it('countCasualtiesSufferedByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 18 },
        { teamId: 2, name: 'Gouged Eye', count: 7 },
      ];
      const { db } = await build(rows);
      await expect(
        service.countCasualtiesSufferedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('countCasualtiesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const { chains } = await build([]);
      await service.countCasualtiesSufferedByTeam({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'casualty',
        'badly_hurt',
        'death',
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
        20,
      ]);
    });

    it('countCasualtiesSufferedByTeam filters on the full casualty-suffered consequence type list', async () => {
      const { chains } = await build([]);
      await service.countCasualtiesSufferedByTeam(FACT_SCOPE_ALL_TIME, 21);
      const condition = firstCallArg(chains[0].where);
      expect(extractFilterValues(condition)).toEqual([
        'casualty',
        'badly_hurt',
        'death',
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
      ]);
    });

    it('countCasualtiesSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const { chains } = await build([]);
      await service.countCasualtiesSufferedByTeam({ competitionId: 30 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.consequence_match_team_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'casualty',
        'badly_hurt',
        'death',
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
        30,
      ]);
    });

    it('countSeriousInjuriesSufferedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 6 }];
      await build(rows);
      await expect(
        service.countSeriousInjuriesSufferedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countSeriousInjuriesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const { chains } = await build([]);
      await service.countSeriousInjuriesSufferedByTeam({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
        20,
      ]);
    });

    it('countSeriousInjuriesSufferedByTeam filters on the serious-injury-suffered consequence type list', async () => {
      const { chains } = await build([]);
      await service.countSeriousInjuriesSufferedByTeam(FACT_SCOPE_ALL_TIME, 21);
      const condition = firstCallArg(chains[0].where);
      expect(extractFilterValues(condition)).toEqual([
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
      ]);
    });

    it('countSeriousInjuriesSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const { chains } = await build([]);
      await service.countSeriousInjuriesSufferedByTeam(
        { competitionId: 30 },
        21,
      );
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.consequence_match_team_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
        30,
      ]);
    });

    it('countLastingInjuriesSufferedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 4 }];
      await build(rows);
      await expect(
        service.countLastingInjuriesSufferedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countLastingInjuriesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const { chains } = await build([]);
      await service.countLastingInjuriesSufferedByTeam({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'niggling_injury',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
        20,
      ]);
    });

    it('countLastingInjuriesSufferedByTeam filters on the lasting-injury-suffered consequence type list', async () => {
      const { chains } = await build([]);
      await service.countLastingInjuriesSufferedByTeam(FACT_SCOPE_ALL_TIME, 21);
      const condition = firstCallArg(chains[0].where);
      expect(extractFilterValues(condition)).toEqual([
        'niggling_injury',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
      ]);
    });

    it('countLastingInjuriesSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const { chains } = await build([]);
      await service.countLastingInjuriesSufferedByTeam(
        { competitionId: 30 },
        21,
      );
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.consequence_match_team_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'niggling_injury',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        'stat_reduction_pa',
        30,
      ]);
    });

    it('countDeathsSufferedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 2 }];
      await build(rows);
      await expect(
        service.countDeathsSufferedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countDeathsSufferedByTeam adds an era filter when an eraId is given', async () => {
      const { chains } = await build([]);
      await service.countDeathsSufferedByTeam({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'death',
        20,
      ]);
    });

    it('countDeathsSufferedByTeam filters on the single death consequence type', async () => {
      const { chains } = await build([]);
      await service.countDeathsSufferedByTeam(FACT_SCOPE_ALL_TIME, 21);
      const condition = firstCallArg(chains[0].where);
      expect(extractFilterValues(condition)).toEqual(['death']);
    });

    it('countDeathsSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const { chains } = await build([]);
      await service.countDeathsSufferedByTeam({ competitionId: 30 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.consequence_match_team_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'death',
        30,
      ]);
    });

    it('sumExpensiveMistakesByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 150000 },
        { teamId: 2, name: 'Reikland Reavers', count: 40000 },
      ];
      const { db } = await build(rows);
      await expect(
        service.sumExpensiveMistakesByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('sumExpensiveMistakesByTeam applies the SQL limit to the query', async () => {
      const { chains } = await build([]);
      await service.sumExpensiveMistakesByTeam(FACT_SCOPE_ALL_TIME, 21);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('sumExpensiveMistakesByTeam filters on the expensive_mistake consequence and era', async () => {
      const { chains } = await build([]);
      await service.sumExpensiveMistakesByTeam({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'expensive_mistake',
        20,
      ]);
    });

    it('sumExpensiveMistakesByTeam joins the consequence side and filters by competition', async () => {
      const { chains } = await build([]);
      await service.sumExpensiveMistakesByTeam({ competitionId: 30 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.consequence_match_team_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'expensive_mistake',
        30,
      ]);
    });

    it('sumExpensiveMistakesByTeam groups by team', async () => {
      const { chains } = await build([]);
      await service.sumExpensiveMistakesByTeam(FACT_SCOPE_ALL_TIME, 21);
      expect(chains[0].groupBy).toHaveBeenCalledTimes(1);
    });

    it('listBiggestExpensiveMistakes returns the rows the query resolves to', async () => {
      const rows = [
        {
          teamId: 1,
          name: '40 grinders',
          count: 90000,
          date: '2026-03-04',
          category: 'normal' as const,
        },
        {
          teamId: 2,
          name: 'Gouged Eye',
          count: 60000,
          date: '2026-02-01',
          category: 'normal' as const,
        },
      ];
      const { db } = await build(rows);
      await expect(
        service.listBiggestExpensiveMistakes(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('listBiggestExpensiveMistakes applies the SQL limit to the query', async () => {
      const { chains } = await build([]);
      await service.listBiggestExpensiveMistakes(FACT_SCOPE_ALL_TIME, 21);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('listBiggestExpensiveMistakes filters on the expensive_mistake consequence and era', async () => {
      const { chains } = await build([]);
      await service.listBiggestExpensiveMistakes({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'expensive_mistake',
        20,
      ]);
    });

    it('listBiggestExpensiveMistakes excludes rows with a null expensive-mistake amount', async () => {
      const { chains } = await build([]);
      await service.listBiggestExpensiveMistakes(FACT_SCOPE_ALL_TIME, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].where)).filter(
          (column) => column === 'match_events.expensive_mistake',
        ),
      ).toHaveLength(1);
    });

    it('listBiggestExpensiveMistakes joins the consequence side and filters by competition', async () => {
      const { chains } = await build([]);
      await service.listBiggestExpensiveMistakes({ competitionId: 30 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.consequence_match_team_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'expensive_mistake',
        30,
      ]);
    });

    it('listBiggestExpensiveMistakes does not group (one row per event)', async () => {
      const { chains } = await build([]);
      await service.listBiggestExpensiveMistakes(FACT_SCOPE_ALL_TIME, 21);
      expect(chains[0].groupBy).not.toHaveBeenCalled();
    });
  });

  describe('league scoping', () => {
    it('sumExpensiveMistakesByTeam filters by league', async () => {
      const { chains } = await build([]);
      await service.sumExpensiveMistakesByTeam({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'expensive_mistake',
        9,
      ]);
    });

    it('listBiggestExpensiveMistakes filters by league', async () => {
      const { chains } = await build([]);
      await service.listBiggestExpensiveMistakes({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'expensive_mistake',
        9,
      ]);
    });
  });
});
