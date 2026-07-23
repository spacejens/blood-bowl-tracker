import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { ExternalSystemsService } from './external-systems.service';

const fakeSystem = {
  id: 1,
  name: 'BBL',
  category: 'imported_data_source' as const,
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

/** A linear join-chain builder whose terminal `.where()` resolves to `rows`. */
function makeQuery(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn().mockResolvedValue(rows);
  return builder;
}

describe('ExternalSystemsService', () => {
  let service: ExternalSystemsService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeSystem])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeSystem]),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [ExternalSystemsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(ExternalSystemsService);
  });

  it('returns the existing system without inserting when name matches', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([fakeSystem]));
    const result = await service.upsert({
      name: 'BBL',
      category: 'imported_data_source',
    });
    expect(result).toEqual({ system: fakeSystem, created: false });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('creates a new system when no name matches', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.upsert({
      name: 'NAF',
      category: 'referenced_not_imported',
    });
    expect(result).toEqual({ system: fakeSystem, created: true });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  describe('countAll', () => {
    it('counts rows excluding the bookkeeping category', async () => {
      const where = vi.fn().mockResolvedValue([{ count: 5 }]);
      const from = vi.fn(() => ({ where }));
      const service = new ExternalSystemsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      // 'bookkeeping' is the excluded category literal.
      expect(extractAllFilterValues(firstCallArg(where))).toEqual([
        'bookkeeping',
      ]);
    });
  });

  describe('countByEra', () => {
    it('dedupes systems reachable directly and via coaches', async () => {
      const direct = makeQuery([{ id: 1 }]);
      const viaCoach = makeQuery([{ id: 1 }, { id: 2 }]);
      const select = vi
        .fn()
        .mockReturnValueOnce(direct)
        .mockReturnValueOnce(viaCoach);
      const service = new ExternalSystemsService({ select } as unknown as Db);

      await expect(service.countByEra(5)).resolves.toBe(2);
      expect(select).toHaveBeenCalledTimes(2);

      // Direct path: eras_external_ids -> external_systems, filtered by era + category.
      expect(extractJoinColumns(firstCallArg(direct.innerJoin, 0, 1))).toEqual([
        'external_systems.id',
        'eras_external_ids.external_system_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(direct.where))).toEqual([
        5,
        'bookkeeping',
      ]);

      // Coach path reaches team_eras.era_id, filtered by era + category.
      expect(extractAllFilterValues(firstCallArg(viaCoach.where))).toEqual([
        5,
        'bookkeeping',
      ]);
    });
  });

  describe('countByCompetition', () => {
    it('dedupes systems reachable directly and via coaches', async () => {
      const direct = makeQuery([{ id: 7 }]);
      const viaCoach = makeQuery([{ id: 8 }]);
      const select = vi
        .fn()
        .mockReturnValueOnce(direct)
        .mockReturnValueOnce(viaCoach);
      const service = new ExternalSystemsService({ select } as unknown as Db);

      await expect(service.countByCompetition(7)).resolves.toBe(2);
      expect(select).toHaveBeenCalledTimes(2);
      expect(extractJoinColumns(firstCallArg(direct.innerJoin, 0, 1))).toEqual([
        'external_systems.id',
        'competitions_external_ids.external_system_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(direct.where))).toEqual([
        7,
        'bookkeeping',
      ]);
      expect(extractAllFilterValues(firstCallArg(viaCoach.where))).toEqual([
        7,
        'bookkeeping',
      ]);
    });
  });

  describe('countByLeague', () => {
    it('dedupes systems reachable directly and via coaches', async () => {
      const direct = makeQuery([{ id: 1 }, { id: 2 }]);
      const viaCoach = makeQuery([{ id: 2 }, { id: 3 }]);
      const select = vi
        .fn()
        .mockReturnValueOnce(direct)
        .mockReturnValueOnce(viaCoach);
      const service = new ExternalSystemsService({ select } as unknown as Db);

      await expect(service.countByLeague(9)).resolves.toBe(3);
      expect(select).toHaveBeenCalledTimes(2);
      expect(extractAllFilterValues(firstCallArg(direct.where))).toEqual([
        9,
        'bookkeeping',
      ]);
      expect(extractAllFilterValues(firstCallArg(viaCoach.where))).toEqual([
        9,
        'bookkeeping',
      ]);
    });
  });

  describe('listNamesByEra', () => {
    it('returns deduped non-bookkeeping names, sorted, from both paths', async () => {
      const direct = makeQuery([{ name: 'BBL' }]);
      const viaCoach = makeQuery([{ name: 'NAF' }, { name: 'BBL' }]);
      const select = vi
        .fn()
        .mockReturnValueOnce(direct)
        .mockReturnValueOnce(viaCoach);
      const service = new ExternalSystemsService({ select } as unknown as Db);

      await expect(service.listNamesByEra(5)).resolves.toEqual(['BBL', 'NAF']);
      expect(select).toHaveBeenCalledTimes(2);
      expect(extractAllFilterValues(firstCallArg(direct.where))).toEqual([
        5,
        'bookkeeping',
      ]);
    });

    it('returns an empty array for an era with no non-bookkeeping systems', async () => {
      const select = vi
        .fn()
        .mockReturnValueOnce(makeQuery([]))
        .mockReturnValueOnce(makeQuery([]));
      const service = new ExternalSystemsService({ select } as unknown as Db);
      await expect(service.listNamesByEra(9)).resolves.toEqual([]);
    });
  });
});
