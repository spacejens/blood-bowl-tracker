import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PositionsService,
  PositionUpsertConflictError,
} from './positions.service';

const fakePosition = {
  id: 1,
  name: 'Lineman',
  raceId: 7,
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
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakePosition])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakePosition]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakePosition]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [PositionsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(PositionsService);
  });

  describe('upsert', () => {
    const data = {
      name: 'Lineman',
      raceId: 7,
      externalIds: [
        { externalSystemId: 1, externalId: '10-7' },
        { externalSystemId: 2, externalId: 'Orc: Lineman' },
      ],
    };

    it('creates a new position when no external IDs match', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));

      const result = await service.upsert(data);

      expect(result).toEqual({ position: fakePosition, created: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('inserts the position with its name and raceId', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakePosition]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert(data);

      expect(insertValues).toHaveBeenCalledWith({ name: 'Lineman', raceId: 7 });
    });

    it('updates the matching position when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { positionId: 1, externalSystemId: 1, externalId: '10-7' },
          ]),
        );

      const result = await service.upsert(data);

      expect(result).toEqual({ position: fakePosition, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws PositionUpsertConflictError when external IDs match different positions', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { positionId: 1, externalSystemId: 1, externalId: '10-7' },
          { positionId: 2, externalSystemId: 2, externalId: 'Orc: Lineman' },
        ]),
      );

      await expect(service.upsert(data)).rejects.toThrow(
        PositionUpsertConflictError,
      );
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing position', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { positionId: 1, externalSystemId: 1, externalId: '10-7' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakePosition]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert(data);

      expect(insertValues).toHaveBeenCalledWith([
        { positionId: 1, externalSystemId: 2, externalId: 'Orc: Lineman' },
      ]);
    });
  });
});
