import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { RacesService, RaceUpsertConflictError } from './races.service';
import { DB } from '@blood-bowl-tracker/db';

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
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeRace])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeRace]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakeRace]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [RacesService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(RacesService);
  });

  describe('upsert', () => {
    const externalIds = [
      { externalSystemId: 1, externalId: 'Orc' },
      { externalSystemId: 2, externalId: 'Orc' },
    ];

    it('creates a new race when no external IDs match', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));

      const result = await service.upsert({ name: 'Orc', externalIds });

      expect(result).toEqual({ race: fakeRace, created: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('updates the matching race when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { raceId: 1, externalSystemId: 1, externalId: 'Orc' },
          ]),
        );

      const result = await service.upsert({ name: 'Orc', externalIds });

      expect(result).toEqual({ race: fakeRace, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws RaceUpsertConflictError when external IDs match different races', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { raceId: 1, externalSystemId: 1, externalId: 'Orc' },
          { raceId: 2, externalSystemId: 2, externalId: 'Orc' },
        ]),
      );

      await expect(
        service.upsert({ name: 'Orc', externalIds }),
      ).rejects.toThrow(RaceUpsertConflictError);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched race', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { raceId: 1, externalSystemId: 1, externalId: 'Orc' },
          { raceId: 1, externalSystemId: 2, externalId: 'Orc' },
        ]),
      );

      await service.upsert({ name: 'Orc', externalIds });

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing race', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { raceId: 1, externalSystemId: 1, externalId: 'Orc' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeRace]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert({ name: 'Orc', externalIds });

      expect(insertValues).toHaveBeenCalledWith([
        { raceId: 1, externalSystemId: 2, externalId: 'Orc' },
      ]);
    });
  });
});
