import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CompetitionsService,
  CompetitionUpsertConflictError,
} from './competitions.service';

const fakeCompetition = {
  id: 1,
  name: 'Major Season 24',
  type: 'season',
  eraId: 20,
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

describe('CompetitionsService', () => {
  let service: CompetitionsService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeCompetition])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCompetition]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakeCompetition]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [CompetitionsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(CompetitionsService);
  });

  describe('upsert', () => {
    const baseData = {
      name: 'Major Season 24',
      type: 'season' as const,
      eraId: 20,
      externalIds: [
        { externalSystemId: 1, externalId: '73' },
        { externalSystemId: 2, externalId: 'Major Season 24' },
      ],
    };

    it('creates a new competition when no external IDs match, writing all columns', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCompetition]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      const result = await service.upsert(baseData);

      expect(result).toEqual({ competition: fakeCompetition, created: true });
      expect(insertValues).toHaveBeenCalledWith({
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('updates the matching competition when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { competitionId: 1, externalSystemId: 1, externalId: '73' },
          ]),
        );

      const result = await service.upsert(baseData);

      expect(result).toEqual({ competition: fakeCompetition, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws CompetitionUpsertConflictError when external IDs match different competitions', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { competitionId: 1, externalSystemId: 1, externalId: '73' },
          {
            competitionId: 2,
            externalSystemId: 2,
            externalId: 'Major Season 24',
          },
        ]),
      );

      await expect(service.upsert(baseData)).rejects.toThrow(
        CompetitionUpsertConflictError,
      );
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing competition', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { competitionId: 1, externalSystemId: 1, externalId: '73' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCompetition]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert(baseData);

      expect(insertValues).toHaveBeenCalledWith([
        {
          competitionId: 1,
          externalSystemId: 2,
          externalId: 'Major Season 24',
        },
      ]);
    });
  });
});
