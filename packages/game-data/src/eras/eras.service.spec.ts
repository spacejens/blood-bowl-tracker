import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErasService, EraUpsertConflictError } from './eras.service';

const fakeEra = {
  id: 1,
  name: 'BB2020',
  leagueId: 10,
  rulesSetId: 20,
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
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeEra])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeEra]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakeEra]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [ErasService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(ErasService);
  });

  describe('upsert', () => {
    const baseData = {
      name: 'BB2020',
      leagueId: 10,
      rulesSetId: 20,
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      externalIds: [
        { externalSystemId: 1, externalId: 'BB2020' },
        { externalSystemId: 2, externalId: 'BB2020' },
      ],
    };

    it('creates a new era when no external IDs match, writing all columns', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeEra]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      const result = await service.upsert(baseData);

      expect(result).toEqual({ era: fakeEra, created: true });
      expect(insertValues).toHaveBeenCalledWith({
        name: 'BB2020',
        leagueId: 10,
        rulesSetId: 20,
        startDate: '2021-09-01',
        endDate: '2023-06-10',
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('stores null for an omitted endDate', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeEra]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert({ ...baseData, endDate: undefined });

      expect(insertValues).toHaveBeenCalledWith({
        name: 'BB2020',
        leagueId: 10,
        rulesSetId: 20,
        startDate: '2021-09-01',
        endDate: null,
      });
    });

    it('updates the matching era when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { eraId: 1, externalSystemId: 1, externalId: 'BB2020' },
          ]),
        );

      const result = await service.upsert(baseData);

      expect(result).toEqual({ era: fakeEra, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws EraUpsertConflictError when external IDs match different eras', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { eraId: 1, externalSystemId: 1, externalId: 'BB2020' },
          { eraId: 2, externalSystemId: 2, externalId: 'BB2020' },
        ]),
      );

      await expect(service.upsert(baseData)).rejects.toThrow(
        EraUpsertConflictError,
      );
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing era', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { eraId: 1, externalSystemId: 1, externalId: 'BB2020' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeEra]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert(baseData);

      expect(insertValues).toHaveBeenCalledWith([
        { eraId: 1, externalSystemId: 2, externalId: 'BB2020' },
      ]);
    });
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
});
