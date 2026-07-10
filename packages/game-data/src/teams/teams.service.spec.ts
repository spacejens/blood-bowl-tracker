import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamsService, TeamUpsertConflictError } from './teams.service';

const fakeTeam = {
  id: 1,
  name: '40 grinders',
  raceId: 5,
  coachId: 9,
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

describe('TeamsService', () => {
  let service: TeamsService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeTeam])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeTeam]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakeTeam]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [TeamsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(TeamsService);
  });

  describe('upsert', () => {
    const baseData = {
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      externalIds: [
        { externalSystemId: 1, externalId: '40g' },
        { externalSystemId: 2, externalId: '40 grinders' },
      ],
    };

    it('creates a new team when no external IDs match, writing all columns', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeTeam]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      const result = await service.upsert(baseData);

      expect(result).toEqual({ team: fakeTeam, created: true });
      expect(insertValues).toHaveBeenCalledWith({
        name: '40 grinders',
        raceId: 5,
        coachId: 9,
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('updates the matching team when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { teamId: 1, externalSystemId: 1, externalId: '40g' },
          ]),
        );

      const result = await service.upsert(baseData);

      expect(result).toEqual({ team: fakeTeam, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws TeamUpsertConflictError when external IDs match different teams', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { teamId: 1, externalSystemId: 1, externalId: '40g' },
          { teamId: 2, externalSystemId: 2, externalId: '40 grinders' },
        ]),
      );

      await expect(service.upsert(baseData)).rejects.toThrow(
        TeamUpsertConflictError,
      );
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched team', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { teamId: 1, externalSystemId: 1, externalId: '40g' },
          { teamId: 1, externalSystemId: 2, externalId: '40 grinders' },
        ]),
      );

      await service.upsert(baseData);

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing team', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { teamId: 1, externalSystemId: 1, externalId: '40g' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeTeam]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert(baseData);

      expect(insertValues).toHaveBeenCalledWith([
        { teamId: 1, externalSystemId: 2, externalId: '40 grinders' },
      ]);
    });
  });
});
