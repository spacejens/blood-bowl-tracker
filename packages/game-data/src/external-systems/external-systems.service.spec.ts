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

function makeCountBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn().mockResolvedValue(rows);
  return builder;
}

function makeListBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.selectDistinct = vi.fn(() => builder);
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.orderBy = vi.fn().mockResolvedValue(rows);
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
    const result = await service.upsert({ name: 'BBL', isBookkeeping: false });
    expect(result).toEqual({ system: fakeSystem, created: false });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('creates a new system when no name matches', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.upsert({ name: 'NAF', isBookkeeping: false });
    expect(result).toEqual({ system: fakeSystem, created: true });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new ExternalSystemsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    it('returns the distinct external-system count for the era', async () => {
      const builder = makeCountBuilder([{ count: 3 }]);
      const select = vi.fn(() => builder);
      const service = new ExternalSystemsService({ select } as unknown as Db);
      await expect(service.countByEra(5)).resolves.toBe(3);
      expect(select).toHaveBeenCalledTimes(1);

      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['external_systems.id', 'eras_external_ids.external_system_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        5,
        false,
      ]);
    });
  });

  describe('countByCompetition', () => {
    it('returns the distinct external-system count for the competition', async () => {
      const builder = makeCountBuilder([{ count: 2 }]);
      const select = vi.fn(() => builder);
      const service = new ExternalSystemsService({ select } as unknown as Db);
      await expect(service.countByCompetition(7)).resolves.toBe(2);
      expect(select).toHaveBeenCalledTimes(1);

      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['external_systems.id', 'competitions_external_ids.external_system_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        7,
        false,
      ]);
    });
  });

  describe('countByLeague', () => {
    it('returns the distinct external-system count for the league', async () => {
      const builder = makeCountBuilder([{ count: 4 }]);
      const select = vi.fn(() => builder);
      const service = new ExternalSystemsService({ select } as unknown as Db);
      await expect(service.countByLeague(9)).resolves.toBe(4);
      expect(select).toHaveBeenCalledTimes(1);

      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['external_systems.id', 'eras_external_ids.external_system_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['eras.id', 'eras_external_ids.era_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        9,
        false,
      ]);
    });
  });

  describe('listNamesByEra', () => {
    it('returns distinct non-bookkeeping system names ordered by name', async () => {
      const builder = makeListBuilder([{ name: 'BBL' }, { name: 'NAF' }]);
      const selectDistinct = vi.fn(() => builder);
      const service = new ExternalSystemsService({
        selectDistinct,
      } as unknown as Db);

      await expect(service.listNamesByEra(5)).resolves.toEqual(['BBL', 'NAF']);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['external_systems.id', 'eras_external_ids.external_system_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        5,
        false,
      ]);
    });

    it('returns an empty array for an era with no non-bookkeeping systems', async () => {
      const builder = makeListBuilder([]);
      const service = new ExternalSystemsService({
        selectDistinct: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.listNamesByEra(9)).resolves.toEqual([]);
    });
  });
});
