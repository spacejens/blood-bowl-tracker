import type { Db } from '@blood-bowl-tracker/db';
import { DB, eraRulesSets, eras, rulesSets } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { ErasService, EraUpsertConflictError } from './eras.service';

const fakeEra = {
  id: 1,
  name: 'BB2020',
  leagueId: 10,
  startDate: '2021-09-01',
  endDate: '2023-06-10',
  createdAt: new Date('2026-01-01'),
};

describe('ErasService', () => {
  let service: ErasService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErasService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(ErasService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  const baseData = {
    name: 'BB2020',
    leagueId: 10,
    rulesSetIds: [20, 21],
    startDate: '2021-09-01',
    endDate: '2023-06-10',
    externalIds: [
      { externalSystemId: 1, externalId: 'BB2020' },
      { externalSystemId: 2, externalId: 'BB2020' },
    ],
  };

  describe('upsert', () => {
    it('creates a new era with its rules sets when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: both external IDs are new and get
      // inserted; query 3: no existing rules-set links; query 4: both
      // rules-set links are new and get inserted.
      const { db, chains } = await build([], [fakeEra]);

      const result = await service.upsert(baseData);

      expect(result).toEqual({
        era: { ...fakeEra, rulesSetIds: [20, 21] },
        created: true,
      });
      expect(firstCallArg(chains[1].values)).toEqual({
        name: 'BB2020',
        leagueId: 10,
        startDate: '2021-09-01',
        endDate: '2023-06-10',
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('omits endDate from the insert when the payload omits it', async () => {
      const { chains } = await build([], [fakeEra]);

      await service.upsert({ ...baseData, endDate: undefined });

      expect(firstCallArg(chains[1].values)).toEqual({
        name: 'BB2020',
        leagueId: 10,
        startDate: '2021-09-01',
      });
    });

    it('leaves a stored endDate alone on update when the payload omits it', async () => {
      // query 0: the external-id lookup matches era 1; query 1: the update.
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'BB2020' }],
        [fakeEra],
      );

      await service.upsert({ ...baseData, endDate: undefined });

      expect(firstCallArg(chains[1].set)).toEqual({
        name: 'BB2020',
        leagueId: 10,
        startDate: '2021-09-01',
      });
    });

    it('writes null on update when the payload explicitly clears endDate', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'BB2020' }],
        [fakeEra],
      );

      await service.upsert({ ...baseData, endDate: null });

      expect(firstCallArg(chains[1].set)).toMatchObject({ endDate: null });
    });

    it('updates the matching era when exactly one external ID matches', async () => {
      const { db } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'BB2020' }],
        [fakeEra],
      );

      const result = await service.upsert(baseData);

      expect(result.created).toBe(false);
      expect(db.update).toHaveBeenCalledWith(eras);
    });

    it('throws EraUpsertConflictError when external IDs match different eras', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: 'BB2020' },
        { ownerId: 2, externalSystemId: 2, externalId: 'BB2020' },
      ]);

      await expect(service.upsert(baseData)).rejects.toThrow(
        EraUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts only the era_rules_sets rows that are new', async () => {
      const { chains } = await build([], [fakeEra], [], [{ rulesSetId: 20 }]);

      const result = await service.upsert(baseData);

      expect(firstCallArg(chains[4].values)).toEqual([
        { eraId: 1, rulesSetId: 21 },
      ]);
      expect(result.era.rulesSetIds).toEqual([20, 21]);
    });

    it('does not insert era_rules_sets rows when all links already exist', async () => {
      const { db, chains } = await build(
        [],
        [fakeEra],
        [],
        [{ rulesSetId: 20 }, { rulesSetId: 21 }],
      );

      const result = await service.upsert(baseData);

      expect(chains).toHaveLength(4);
      expect(db.insert).not.toHaveBeenCalledWith(eraRulesSets);
      expect(result.era.rulesSetIds).toEqual([20, 21]);
    });
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
    it('returns the matching era id and name', async () => {
      const { chains } = await build([{ id: 7, name: 'BB2020' }]);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'BB2020',
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
  });

  describe('searchByNamePrefix', () => {
    it('returns eras with their league name, limited', async () => {
      const rows = [{ id: 7, name: 'BB2020', leagueName: 'Premier League' }];
      likePattern.escape.mockReturnValue('bb');
      const { chains } = await build(rows);
      await expect(service.searchByNamePrefix('bb', 25)).resolves.toEqual(rows);
      expect(chains[0].limit).toHaveBeenCalledWith(25);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['leagues.id', 'eras.league_id']);
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
