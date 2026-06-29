import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { TeamsService } from './teams.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeTeam = {
  id: 1,
  name: 'Orcland Raiders',
  raceId: 1,
  coachId: 1,
  createdAt: new Date('2026-01-01'),
};

describe('TeamsService', () => {
  let service: TeamsService;
  let mockDb: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const selectChain = { from: vi.fn() };
    const insertChain = { values: vi.fn() };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };
    selectChain.from.mockResolvedValue([fakeTeam]);
    insertChain.values = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([fakeTeam]) }));

    const module = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get(TeamsService);
  });

  it('findAll returns a list of teams', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeTeam]);
  });

  it('create inserts and returns the new team', async () => {
    const result = await service.create({ name: 'Orcland Raiders', raceId: 1, coachId: 1 });
    expect(result.name).toBe('Orcland Raiders');
  });
});
