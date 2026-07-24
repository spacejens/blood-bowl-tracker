import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
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

describe('ExternalSystemsService', () => {
  let service: ExternalSystemsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [ExternalSystemsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(ExternalSystemsService);
    return { db, chains };
  }

  it('returns the existing system without inserting when name matches', async () => {
    const { db } = await build([fakeSystem]);
    const result = await service.upsert({
      name: 'BBL',
      category: 'imported_data_source',
    });
    expect(result).toEqual({ system: fakeSystem, created: false });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates a new system when no name matches', async () => {
    const { db } = await build([], [fakeSystem]);
    const result = await service.upsert({
      name: 'NAF',
      category: 'referenced_not_imported',
    });
    expect(result).toEqual({ system: fakeSystem, created: true });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(db.insert).toHaveBeenCalled();
  });

  describe('countAll', () => {
    it('counts only imported-data-source systems', async () => {
      const { chains } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'imported_data_source',
      ]);
    });
  });

  describe('countByEra', () => {
    it('returns the distinct imported-data-source count for the era', async () => {
      const { db, chains } = await build([{ count: 3 }]);

      await expect(service.countByEra(5)).resolves.toBe(3);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.select).toHaveBeenCalledTimes(1);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual([
        'external_systems.id',
        'eras_external_ids.external_system_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        5,
        'imported_data_source',
      ]);
    });
  });

  describe('countByCompetition', () => {
    it('returns the distinct imported-data-source count for the competition', async () => {
      const { db, chains } = await build([{ count: 2 }]);

      await expect(service.countByCompetition(7)).resolves.toBe(2);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.select).toHaveBeenCalledTimes(1);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual([
        'external_systems.id',
        'competitions_external_ids.external_system_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        7,
        'imported_data_source',
      ]);
    });
  });

  describe('countByLeague', () => {
    it('returns the distinct imported-data-source count for the league', async () => {
      const { db, chains } = await build([{ count: 1 }]);

      await expect(service.countByLeague(9)).resolves.toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.select).toHaveBeenCalledTimes(1);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual([
        'external_systems.id',
        'eras_external_ids.external_system_id',
      ]);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'eras_external_ids.era_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9,
        'imported_data_source',
      ]);
    });
  });

  describe('listNamesByEra', () => {
    it('returns sorted imported-data-source names for the era', async () => {
      const { chains } = await build([{ name: 'BBL' }, { name: 'TP' }]);

      await expect(service.listNamesByEra(5)).resolves.toEqual(['BBL', 'TP']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual([
        'external_systems.id',
        'eras_external_ids.external_system_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        5,
        'imported_data_source',
      ]);
    });

    it('returns an empty array for an era with no imported-data-source systems', async () => {
      await build([]);
      await expect(service.listNamesByEra(9)).resolves.toEqual([]);
    });
  });
});
