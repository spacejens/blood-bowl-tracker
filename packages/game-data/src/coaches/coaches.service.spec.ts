import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoachesService, CoachUpsertConflictError } from './coaches.service';

const fakeCoach = {
  id: 1,
  name: 'Roze Madder',
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

describe('CoachesService', () => {
  let service: CoachesService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeCoach])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCoach]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakeCoach]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [CoachesService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(CoachesService);
  });

  describe('upsert', () => {
    const externalIds = [
      { externalSystemId: 1, externalId: 'id:47' },
      { externalSystemId: 1, externalId: 'name:roze madder' },
    ];

    it('creates a new coach when no external IDs match', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));

      const result = await service.upsert({
        name: 'Roze Madder',
        externalIds,
      });

      expect(result).toEqual({ coach: fakeCoach, created: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('updates the matching coach when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { coachId: 1, externalSystemId: 1, externalId: 'id:47' },
          ]),
        );

      const result = await service.upsert({
        name: 'Roze Madder',
        externalIds,
      });

      expect(result).toEqual({ coach: fakeCoach, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws CoachUpsertConflictError when external IDs match different coaches', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { coachId: 1, externalSystemId: 1, externalId: 'id:47' },
          {
            coachId: 2,
            externalSystemId: 1,
            externalId: 'name:roze madder',
          },
        ]),
      );

      await expect(
        service.upsert({ name: 'Roze Madder', externalIds }),
      ).rejects.toThrow(CoachUpsertConflictError);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched coach', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { coachId: 1, externalSystemId: 1, externalId: 'id:47' },
          {
            coachId: 1,
            externalSystemId: 1,
            externalId: 'name:roze madder',
          },
        ]),
      );

      await service.upsert({ name: 'Roze Madder', externalIds });

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing coach', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { coachId: 1, externalSystemId: 1, externalId: 'id:47' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCoach]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert({ name: 'Roze Madder', externalIds });

      expect(insertValues).toHaveBeenCalledWith([
        { coachId: 1, externalSystemId: 1, externalId: 'name:roze madder' },
      ]);
    });
  });

  describe('toplist queries', () => {
    function makeQueryBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      const chain = vi.fn(() => builder);
      builder.from = chain;
      builder.innerJoin = chain;
      builder.groupBy = chain;
      builder.orderBy = chain;
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject);
      return builder;
    }

    it('countMatchesPlayedByCoach returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 9 },
        { coachId: 2, name: 'Grashnak', count: 4 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new CoachesService({ select } as unknown as Db);
      await expect(service.countMatchesPlayedByCoach()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countTeamsByCoach returns the rows the query resolves to', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 3 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new CoachesService({ select } as unknown as Db);
      await expect(service.countTeamsByCoach()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });
  });
});
