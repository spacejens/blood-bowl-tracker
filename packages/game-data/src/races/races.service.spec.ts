import type { Db } from '@blood-bowl-tracker/db';
import { DB, raceEras, raceExternalIds, races } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RacesService, RaceUpsertConflictError } from './races.service';

const fakeRace = {
  id: 1,
  name: 'Orc',
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

describe('RacesService', () => {
  let service: RacesService;
  let externalIdRows: unknown[];
  let existingEraRows: { eraId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingEraRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === raceExternalIds ? externalIdRows : existingEraRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakeRace]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({ returning: () => Promise.resolve([fakeRace]) }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [RacesService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(RacesService);
  });

  describe('upsert', () => {
    const baseData = {
      name: 'Orc',
      eras: [5, 6],
      externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
    };

    it('creates a new race with its eras when no external IDs match', async () => {
      const result = await service.upsert(baseData);
      expect(result).toEqual({
        race: { ...fakeRace, eras: [5, 6] },
        created: true,
      });
      expect(updateCalls).toHaveLength(0);
    });

    it('defaults to no era links when eras is omitted', async () => {
      const result = await service.upsert({
        name: 'Orc',
        externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
      });
      expect(result.race.eras).toEqual([]);
      expect(insertCalls.some((c) => c.table === raceEras)).toBe(false);
    });

    it('inserts only the race_eras rows that are new', async () => {
      existingEraRows = [{ eraId: 5 }];
      const result = await service.upsert(baseData);
      const call = insertCalls.find((c) => c.table === raceEras);
      expect(call?.values).toEqual([{ raceId: 1, eraId: 6 }]);
      expect(result.race.eras).toEqual([5, 6]);
    });

    it('does not insert race_eras rows when all links already exist', async () => {
      existingEraRows = [{ eraId: 5 }, { eraId: 6 }];
      const result = await service.upsert(baseData);
      expect(insertCalls.some((c) => c.table === raceEras)).toBe(false);
      expect(result.race.eras).toEqual([5, 6]);
    });

    it('updates the matching race when exactly one external ID matches', async () => {
      externalIdRows = [{ raceId: 1, externalSystemId: 1, externalId: 'Orc' }];
      const result = await service.upsert(baseData);
      expect(result.created).toBe(false);
      expect(updateCalls.some((c) => c.table === races)).toBe(true);
    });

    it('throws RaceUpsertConflictError when external IDs match different races', async () => {
      externalIdRows = [
        { raceId: 1, externalSystemId: 1, externalId: 'Orc' },
        { raceId: 2, externalSystemId: 2, externalId: 'Orc' },
      ];
      await expect(service.upsert(baseData)).rejects.toThrow(
        RaceUpsertConflictError,
      );
      expect(insertCalls).toHaveLength(0);
      expect(updateCalls).toHaveLength(0);
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new RacesService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });
});
