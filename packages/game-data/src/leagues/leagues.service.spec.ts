import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeaguesService, LeagueUpsertConflictError } from './leagues.service';

const fakeLeague = {
  id: 1,
  name: 'Test League',
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

describe('LeaguesService', () => {
  let service: LeaguesService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeLeague])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeLeague]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakeLeague]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [LeaguesService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(LeaguesService);
  });

  describe('upsert', () => {
    const externalIds = [
      { externalSystemId: 1, externalId: 'Test League' },
      { externalSystemId: 2, externalId: 'Test League' },
    ];

    it('creates a new league when no external IDs match', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));

      const result = await service.upsert({ name: 'Test League', externalIds });

      expect(result).toEqual({ league: fakeLeague, created: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('updates the matching league when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { leagueId: 1, externalSystemId: 1, externalId: 'Test League' },
          ]),
        );

      const result = await service.upsert({ name: 'Test League', externalIds });

      expect(result).toEqual({ league: fakeLeague, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws LeagueUpsertConflictError when external IDs match different leagues', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { leagueId: 1, externalSystemId: 1, externalId: 'Test League' },
          { leagueId: 2, externalSystemId: 2, externalId: 'Test League' },
        ]),
      );

      await expect(
        service.upsert({ name: 'Test League', externalIds }),
      ).rejects.toThrow(LeagueUpsertConflictError);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched league', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { leagueId: 1, externalSystemId: 1, externalId: 'Test League' },
          { leagueId: 1, externalSystemId: 2, externalId: 'Test League' },
        ]),
      );

      await service.upsert({ name: 'Test League', externalIds });

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing league', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { leagueId: 1, externalSystemId: 1, externalId: 'Test League' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeLeague]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert({ name: 'Test League', externalIds });

      expect(insertValues).toHaveBeenCalledWith([
        { leagueId: 1, externalSystemId: 2, externalId: 'Test League' },
      ]);
    });
  });
});
