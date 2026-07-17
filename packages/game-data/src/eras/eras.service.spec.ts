import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eraExternalIds,
  eraRulesSets,
  eras,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { ErasService, EraUpsertConflictError } from './eras.service';

function makeCountBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return builder;
}

const fakeEra = {
  id: 1,
  name: 'BB2020',
  leagueId: 10,
  startDate: '2021-09-01',
  endDate: '2023-06-10',
  createdAt: new Date('2026-01-01'),
};

function makeFromBuilder(rows: unknown[]) {
  return {
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
}

describe('ErasService', () => {
  let service: ErasService;
  let externalIdRows: unknown[];
  let existingRulesSetRows: { rulesSetId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingRulesSetRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === eraExternalIds ? externalIdRows : existingRulesSetRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakeEra]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({ returning: () => Promise.resolve([fakeEra]) }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [ErasService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(ErasService);
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

  it('creates a new era with its rules sets when no external IDs match', async () => {
    const result = await service.upsert(baseData);

    expect(result).toEqual({
      era: { ...fakeEra, rulesSetIds: [20, 21] },
      created: true,
    });
    expect(
      insertCalls.some(
        (c) =>
          c.table === eras &&
          JSON.stringify(c.values) ===
            JSON.stringify({
              name: 'BB2020',
              leagueId: 10,
              startDate: '2021-09-01',
              endDate: '2023-06-10',
            }),
      ),
    ).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('stores null for an omitted endDate', async () => {
    await service.upsert({ ...baseData, endDate: undefined });
    const eraInsert = insertCalls.find((c) => c.table === eras);
    expect(eraInsert?.values).toMatchObject({ endDate: null });
  });

  it('updates the matching era when exactly one external ID matches', async () => {
    externalIdRows = [
      { ownerId: 1, externalSystemId: 1, externalId: 'BB2020' },
    ];
    const result = await service.upsert(baseData);
    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === eras)).toBe(true);
  });

  it('throws EraUpsertConflictError when external IDs match different eras', async () => {
    externalIdRows = [
      { ownerId: 1, externalSystemId: 1, externalId: 'BB2020' },
      { ownerId: 2, externalSystemId: 2, externalId: 'BB2020' },
    ];
    await expect(service.upsert(baseData)).rejects.toThrow(
      EraUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts only the era_rules_sets rows that are new', async () => {
    existingRulesSetRows = [{ rulesSetId: 20 }];
    const result = await service.upsert(baseData);
    const call = insertCalls.find((c) => c.table === eraRulesSets);
    expect(call?.values).toEqual([{ eraId: 1, rulesSetId: 21 }]);
    expect(result.era.rulesSetIds).toEqual([20, 21]);
  });

  it('does not insert era_rules_sets rows when all links already exist', async () => {
    existingRulesSetRows = [{ rulesSetId: 20 }, { rulesSetId: 21 }];
    const result = await service.upsert(baseData);
    expect(insertCalls.some((c) => c.table === eraRulesSets)).toBe(false);
    expect(result.era.rulesSetIds).toEqual([20, 21]);
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new ErasService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('returns the matching era id and name', async () => {
      const where = vi.fn().mockResolvedValue([{ id: 7, name: 'BB2020' }]);
      const from = vi.fn(() => ({ where }));
      const service = new ErasService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'BB2020',
      });
      expect(where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(where))).toBe(7);
    });

    it('returns undefined when no era matches', async () => {
      const where = vi.fn().mockResolvedValue([]);
      const from = vi.fn(() => ({ where }));
      const service = new ErasService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(where))).toBe(999);
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns eras with their league name, limited', async () => {
      const rows = [{ id: 7, name: 'BB2020', leagueName: 'Premier League' }];
      const limit = vi.fn().mockResolvedValue(rows);
      const where = vi.fn(() => ({ limit }));
      const innerJoin = vi.fn(() => ({ where }));
      const from = vi.fn(() => ({ innerJoin }));
      const service = new ErasService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.searchByNamePrefix('bb', 25)).resolves.toEqual(rows);
      expect(limit).toHaveBeenCalledWith(25);
      expect(extractJoinColumns(firstCallArg(innerJoin, 0, 1))).toEqual([
        'leagues.id',
        'eras.league_id',
      ]);
    });

    it('escapes LIKE metacharacters in the prefix before matching', async () => {
      const limit = vi.fn().mockResolvedValue([]);
      const where = vi.fn((_condition: { queryChunks: unknown[] }) => ({
        limit,
      }));
      const innerJoin = vi.fn(() => ({ where }));
      const from = vi.fn(() => ({ innerJoin }));
      const service = new ErasService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);

      await service.searchByNamePrefix('50%_\\off', 25);

      expect(where).toHaveBeenCalledTimes(1);
      const condition = where.mock.calls[0][0];
      // The escaped pattern value is passed as a raw SQL parameter chunk.
      expect(condition.queryChunks).toContain('50\\%\\_\\\\off%');
    });
  });

  describe('getRulesSetNames', () => {
    it("returns the era's rules-set names ordered by rules set id (earliest first)", async () => {
      const rows = [{ name: 'BB2016' }, { name: 'BB2020' }];
      const builder = makeCountBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new ErasService({ select } as unknown as Db);
      await expect(service.getRulesSetNames(5)).resolves.toEqual([
        'BB2016',
        'BB2020',
      ]);
      expect(select).toHaveBeenCalledTimes(1);

      expect(builder.orderBy).toHaveBeenCalledWith(rulesSets.id);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['rules_sets.id', 'era_rules_sets.rules_set_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
    });

    it('returns an empty array when the era has no rules sets', async () => {
      const select = vi.fn(() => makeCountBuilder([]));
      const service = new ErasService({ select } as unknown as Db);
      await expect(service.getRulesSetNames(5)).resolves.toEqual([]);
    });
  });

  describe('listErasWithLeague', () => {
    it('returns the rows the query resolves to', async () => {
      const rows = [
        {
          id: 1,
          name: 'Season 1',
          leagueName: 'Premier',
          startDate: '2020-01-01',
          endDate: null,
        },
      ];
      const builder = makeCountBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new ErasService({ select } as unknown as Db);
      await expect(service.listErasWithLeague()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['leagues.id', 'eras.league_id'],
      );
    });
  });
});
