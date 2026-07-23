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
    it('counts only imported-data-source systems', async () => {
      const where = vi.fn().mockResolvedValue([{ count: 5 }]);
      const from = vi.fn(() => ({ where }));
      const service = new ExternalSystemsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      expect(extractAllFilterValues(firstCallArg(where))).toEqual([
        'imported_data_source',
      ]);
    });
  });

  describe('countByEra', () => {
    it('returns the distinct imported-data-source count for the era', async () => {
      const builder = makeCountBuilder([{ count: 3 }]);
      const select = vi.fn(() => builder);
      const service = new ExternalSystemsService({ select } as unknown as Db);

      await expect(service.countByEra(5)).resolves.toBe(3);
      expect(select).toHaveBeenCalledTimes(1);

      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['external_systems.id', 'eras_external_ids.external_system_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        5,
        'imported_data_source',
      ]);
    });
  });

  describe('countByCompetition', () => {
    it('returns the distinct imported-data-source count for the competition', async () => {
      const builder = makeCountBuilder([{ count: 2 }]);
      const select = vi.fn(() => builder);
      const service = new ExternalSystemsService({ select } as unknown as Db);

      await expect(service.countByCompetition(7)).resolves.toBe(2);
      expect(select).toHaveBeenCalledTimes(1);

      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['external_systems.id', 'competitions_external_ids.external_system_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        7,
        'imported_data_source',
      ]);
    });
  });

  describe('countByLeague', () => {
    it('returns the distinct imported-data-source count for the league', async () => {
      const builder = makeCountBuilder([{ count: 1 }]);
      const select = vi.fn(() => builder);
      const service = new ExternalSystemsService({ select } as unknown as Db);

      await expect(service.countByLeague(9)).resolves.toBe(1);
      expect(select).toHaveBeenCalledTimes(1);

      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['external_systems.id', 'eras_external_ids.external_system_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['eras.id', 'eras_external_ids.era_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        9,
        'imported_data_source',
      ]);
    });
  });

  describe('listNamesByEra', () => {
    it('returns sorted imported-data-source names for the era', async () => {
      const builder = makeListBuilder([{ name: 'BBL' }, { name: 'TP' }]);
      const selectDistinct = vi.fn(() => builder);
      const service = new ExternalSystemsService({
        selectDistinct,
      } as unknown as Db);

      await expect(service.listNamesByEra(5)).resolves.toEqual(['BBL', 'TP']);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['external_systems.id', 'eras_external_ids.external_system_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        5,
        'imported_data_source',
      ]);
    });

    it('returns an empty array for an era with no imported-data-source systems', async () => {
      const builder = makeListBuilder([]);
      const service = new ExternalSystemsService({
        selectDistinct: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.listNamesByEra(9)).resolves.toEqual([]);
    });
  });
});
