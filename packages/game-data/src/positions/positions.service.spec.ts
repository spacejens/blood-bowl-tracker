import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  positionExternalIds,
  positions,
  positionsRaceEras,
  raceEras,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PositionsService,
  PositionUpsertConflictError,
} from './positions.service';

const fakePosition = {
  id: 1,
  name: 'Lineman',
  isStarPlayer: false,
  createdAt: new Date('2026-01-01'),
};

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

function makeFromBuilder(rows: unknown[]) {
  return {
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
}

describe('PositionsService', () => {
  let service: PositionsService;
  let externalIdRows: unknown[];
  let existingRaceRows: unknown[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingRaceRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === positionExternalIds ? externalIdRows : existingRaceRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakePosition]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({ returning: () => Promise.resolve([fakePosition]) }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [PositionsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(PositionsService);
  });

  const data = {
    name: 'Lineman',
    isStarPlayer: false,
    externalIds: [
      { externalSystemId: 1, externalId: '10-7' },
      { externalSystemId: 2, externalId: 'Orc: Lineman' },
    ],
  };

  it('creates a new position when no external IDs match', async () => {
    const result = await service.upsert(data);

    expect(result).toEqual({
      position: fakePosition,
      created: true,
    });
    expect(insertCalls.some((c) => c.table === positions)).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts the position with its name and isStarPlayer flag', async () => {
    await service.upsert({ ...data, isStarPlayer: true });

    const call = insertCalls.find((c) => c.table === positions);
    expect(call?.values).toEqual({ name: 'Lineman', isStarPlayer: true });
  });

  it('updates the matching position when exactly one external ID matches', async () => {
    externalIdRows = [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }];

    const result = await service.upsert(data);

    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === positions)).toBe(true);
  });

  it('throws PositionUpsertConflictError when external IDs match different positions', async () => {
    externalIdRows = [
      { ownerId: 1, externalSystemId: 1, externalId: '10-7' },
      { ownerId: 2, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ];

    await expect(service.upsert(data)).rejects.toThrow(
      PositionUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts only the external IDs that are new for an existing position', async () => {
    externalIdRows = [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }];

    await service.upsert(data);

    const call = insertCalls.find((c) => c.table === positionExternalIds);
    expect(call?.values).toEqual([
      { positionId: 1, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ]);
  });

  describe('syncRaceEras', () => {
    function makeSyncDb(raceEraRows: unknown[], existingRows: unknown[]) {
      const calls: { table: unknown; values: unknown }[] = [];
      const db = {
        select: () => ({
          from: (table: unknown) =>
            makeFromBuilder(table === raceEras ? raceEraRows : existingRows),
        }),
        insert: (table: unknown) => ({
          values: (values: unknown) => {
            calls.push({ table, values });
            return Promise.resolve();
          },
        }),
      };
      return { db: db as unknown as Db, calls };
    }

    it('resolves (raceId, eraId) pairs to race_era ids and inserts positions_race_eras rows', async () => {
      const { db, calls } = makeSyncDb(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 101, raceId: 2, eraId: 6 },
        ],
        [],
      );
      const service = new PositionsService(db);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100, 101] });
      const call = calls.find((c) => c.table === positionsRaceEras);
      expect(call?.values).toEqual([
        { positionId: 1, raceEraId: 100 },
        { positionId: 1, raceEraId: 101 },
      ]);
    });

    it('does not re-insert an already-present positions_race_eras row', async () => {
      const { db, calls } = makeSyncDb(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 101, raceId: 2, eraId: 6 },
        ],
        [{ raceEraId: 100 }],
      );
      const service = new PositionsService(db);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100, 101] });
      const call = calls.find((c) => c.table === positionsRaceEras);
      expect(call?.values).toEqual([{ positionId: 1, raceEraId: 101 }]);
    });

    it('skips a (raceId, eraId) pair that has no matching race_era row', async () => {
      const { db, calls } = makeSyncDb([{ id: 100, raceId: 2, eraId: 5 }], []);
      const service = new PositionsService(db);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      const call = calls.find((c) => c.table === positionsRaceEras);
      expect(call?.values).toEqual([{ positionId: 1, raceEraId: 100 }]);
    });

    it('dedupes duplicate resolved race_era ids so only one row is inserted', async () => {
      const { db, calls } = makeSyncDb(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 100, raceId: 3, eraId: 5 },
        ],
        [],
      );
      const service = new PositionsService(db);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 3, eraId: 5 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      const call = calls.find((c) => c.table === positionsRaceEras);
      expect(call?.values).toEqual([{ positionId: 1, raceEraId: 100 }]);
    });

    it('returns an empty list and inserts nothing for empty input', async () => {
      const { db, calls } = makeSyncDb([], []);
      const service = new PositionsService(db);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [] });
      expect(calls).toHaveLength(0);
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new PositionsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    it('counts distinct positions available in the era via positions_race_eras', async () => {
      const builder = makeCountBuilder([{ count: 40 }]);
      const select = vi.fn(() => builder);
      const service = new PositionsService({ select } as unknown as Db);
      await expect(service.countByEra(5)).resolves.toBe(40);
      expect(builder.innerJoin).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByCompetition', () => {
    it('counts distinct positions available for each team-era in the competition', async () => {
      const builder = makeCountBuilder([{ count: 25 }]);
      const select = vi.fn(() => builder);
      const service = new PositionsService({ select } as unknown as Db);
      await expect(service.countByCompetition(7)).resolves.toBe(25);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
    });
  });
});
