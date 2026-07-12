import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  positionExternalIds,
  positions,
  positionsRaces,
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
    races: [{ raceId: 7, isDeleted: false }],
    externalIds: [
      { externalSystemId: 1, externalId: '10-7' },
      { externalSystemId: 2, externalId: 'Orc: Lineman' },
    ],
  };

  it('creates a new position with its races when no external IDs match', async () => {
    const result = await service.upsert(data);

    expect(result).toEqual({
      position: { ...fakePosition, races: data.races },
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
    externalIdRows = [
      { positionId: 1, externalSystemId: 1, externalId: '10-7' },
    ];
    existingRaceRows = [{ raceId: 7, isDeleted: false }];

    const result = await service.upsert(data);

    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === positions)).toBe(true);
  });

  it('throws PositionUpsertConflictError when external IDs match different positions', async () => {
    externalIdRows = [
      { positionId: 1, externalSystemId: 1, externalId: '10-7' },
      { positionId: 2, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ];

    await expect(service.upsert(data)).rejects.toThrow(
      PositionUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts only the external IDs that are new for an existing position', async () => {
    externalIdRows = [
      { positionId: 1, externalSystemId: 1, externalId: '10-7' },
    ];

    await service.upsert(data);

    const call = insertCalls.find((c) => c.table === positionExternalIds);
    expect(call?.values).toEqual([
      { positionId: 1, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ]);
  });

  it('inserts a positions_races row for a race relation that does not exist yet', async () => {
    existingRaceRows = [];

    await service.upsert(data);

    const call = insertCalls.find((c) => c.table === positionsRaces);
    expect(call?.values).toEqual([
      { positionId: 1, raceId: 7, isDeleted: false },
    ]);
  });

  it('updates isDeleted on an existing positions_races relation when it changed', async () => {
    externalIdRows = [
      { positionId: 1, externalSystemId: 1, externalId: '10-7' },
    ];
    existingRaceRows = [{ raceId: 7, isDeleted: false }];

    await service.upsert({ ...data, races: [{ raceId: 7, isDeleted: true }] });

    const insert = insertCalls.find((c) => c.table === positionsRaces);
    const update = updateCalls.find((c) => c.table === positionsRaces);
    expect(insert).toBeUndefined();
    expect(update?.set).toEqual({ isDeleted: true });
  });

  it('leaves positions_races untouched when the relation is unchanged', async () => {
    externalIdRows = [
      { positionId: 1, externalSystemId: 1, externalId: '10-7' },
    ];
    existingRaceRows = [{ raceId: 7, isDeleted: false }];

    await service.upsert(data);

    expect(insertCalls.some((c) => c.table === positionsRaces)).toBe(false);
    expect(updateCalls.some((c) => c.table === positionsRaces)).toBe(false);
  });

  it('returns the requested races and star flag on the position', async () => {
    const result = await service.upsert({
      name: 'Wilhelm Chaney',
      isStarPlayer: true,
      races: [
        { raceId: 7, isDeleted: false },
        { raceId: 8, isDeleted: false },
      ],
      externalIds: [{ externalSystemId: 1, externalId: '99-14' }],
    });

    expect(result.position.races).toEqual([
      { raceId: 7, isDeleted: false },
      { raceId: 8, isDeleted: false },
    ]);
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
});
