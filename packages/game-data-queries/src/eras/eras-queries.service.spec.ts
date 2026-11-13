import type { Db } from '@blood-bowl-tracker/db';
import { DB, eras, leagues, rulesSets } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { ErasQueriesService } from './eras-queries.service';

describe('ErasQueriesService', () => {
  let service: ErasQueriesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErasQueriesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(ErasQueriesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { chains } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(chains[0].from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByLeague', () => {
    it('returns the era count for the league', async () => {
      const { db, chains } = await build([{ count: 4 }]);
      await expect(service.countByLeague(9)).resolves.toBe(4);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('findById', () => {
    it('returns the matching era id, name and date range', async () => {
      const { chains } = await build([
        { id: 7, name: 'BB2020', startDate: '2020-01-01', endDate: null },
      ]);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'BB2020',
        startDate: '2020-01-01',
        endDate: null,
      });
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('returns undefined when no era matches', async () => {
      const { chains } = await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(999);
    });

    it("selects the era's own date range", async () => {
      const { db } = await build([]);

      await service.findById(1);

      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['startDate', 'endDate']),
      );
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns eras with their league name and date span, limited', async () => {
      const rows = [
        {
          id: 7,
          name: 'BB2020',
          leagueName: 'Premier League',
          startDate: '2020-01-01',
          endDate: null,
        },
      ];
      likePattern.escape.mockReturnValue('bb');
      const { db, chains } = await build(rows);
      await expect(service.searchByNamePrefix('bb', 25)).resolves.toEqual(rows);
      expect(chains[0].limit).toHaveBeenCalledWith(25);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['leagues.id', 'eras.league_id']);
      expect(firstCallArg(db.select)).toEqual({
        id: eras.id,
        name: eras.name,
        leagueName: leagues.name,
        startDate: eras.startDate,
        endDate: eras.endDate,
      });
    });

    it('escapes LIKE metacharacters in the prefix before matching', async () => {
      likePattern.escape.mockReturnValue('50\\%\\_\\\\off');
      const { chains } = await build([]);

      await service.searchByNamePrefix('50%_\\off', 25);

      expect(chains[0].where).toHaveBeenCalledTimes(1);
      // The escaped pattern value is passed as a raw SQL parameter chunk.
      const condition = firstCallArg(chains[0].where) as {
        queryChunks: unknown[];
      };
      expect(condition.queryChunks).toContain('50\\%\\_\\\\off%');
    });
  });

  describe('getRulesSetNames', () => {
    it("returns the era's rules-set names ordered by rules set id (earliest first)", async () => {
      const rows = [{ name: 'BB2016' }, { name: 'BB2020' }];
      const { db, chains } = await build(rows);
      await expect(service.getRulesSetNames(5)).resolves.toEqual([
        'BB2016',
        'BB2020',
      ]);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(chains[0].orderBy).toHaveBeenCalledWith(rulesSets.id);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['rules_sets.id', 'era_rules_sets.rules_set_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });

    it('returns an empty array when the era has no rules sets', async () => {
      await build([]);
      await expect(service.getRulesSetNames(5)).resolves.toEqual([]);
    });
  });

  describe('getRulesSetNamesByLeague', () => {
    it('returns the distinct rules-set names across the league, ordered by id', async () => {
      const rows = [
        { id: 1, name: 'BB2016' },
        { id: 2, name: 'BB2020' },
      ];
      const { db, chains } = await build(rows);
      await expect(service.getRulesSetNamesByLeague(9)).resolves.toEqual([
        'BB2016',
        'BB2020',
      ]);
      expect(db.selectDistinct).toHaveBeenCalledTimes(1);
      // `id` must be selected alongside `name` -- Postgres rejects SELECT
      // DISTINCT with an ORDER BY expression that isn't in the select list,
      // and this query orders by rulesSets.id (regression test for that).
      expect(Object.keys(firstCallArg(db.selectDistinct) as object)).toEqual([
        'id',
        'name',
      ]);
      expect(chains[0].orderBy).toHaveBeenCalledWith(rulesSets.id);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['rules_sets.id', 'era_rules_sets.rules_set_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'era_rules_sets.era_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('returns an empty array when the league has no rules sets', async () => {
      await build([]);
      await expect(service.getRulesSetNamesByLeague(9)).resolves.toEqual([]);
    });
  });
  describe('listErasWithLeague', () => {
    const rows = [
      {
        id: 1,
        name: 'Season 1',
        leagueName: 'Premier',
        startDate: '2020-01-01',
        endDate: null,
      },
    ];

    it('returns the rows the query resolves to and joins eras to leagues', async () => {
      const { db, chains } = await build(rows);
      await expect(service.listErasWithLeague({})).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['leagues.id', 'eras.league_id']);
    });

    it('filters by league id when the scope carries a leagueId', async () => {
      const { chains } = await build(rows);
      await service.listErasWithLeague({ leagueId: 42 });
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(42);
    });

    it('applies no league filter when the scope has no leagueId', async () => {
      const { chains } = await build(rows);
      await service.listErasWithLeague({});
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(firstCallArg(chains[0].where)).toBeUndefined();
    });
  });

  describe('findByIdWithLeague', () => {
    it('returns the era with its league name and dates', async () => {
      const row = {
        id: 7,
        name: 'BB2020',
        leagueName: 'Premier League',
        startDate: '2021-09-01',
        endDate: '2023-06-10',
      };
      const { chains } = await build([row]);
      await expect(service.findByIdWithLeague(7)).resolves.toEqual(row);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['leagues.id', 'eras.league_id']);
    });

    it('returns undefined when no era matches', async () => {
      const { chains } = await build([]);
      await expect(service.findByIdWithLeague(999)).resolves.toBeUndefined();
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(999);
    });
  });
});
