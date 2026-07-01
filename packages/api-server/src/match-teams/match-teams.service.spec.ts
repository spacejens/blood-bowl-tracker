import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MatchTeamsService } from './match-teams.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeMatchTeam = { matchId: 1, teamId: 1 };

describe('MatchTeamsService', () => {
  let service: MatchTeamsService;

  beforeEach(async () => {
    const selectChain = { from: vi.fn().mockResolvedValue([fakeMatchTeam]) };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeMatchTeam]),
      })),
    };
    const mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [MatchTeamsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(MatchTeamsService);
  });

  it('findAll returns a list of match-team associations', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeMatchTeam]);
  });

  it('create inserts and returns the new association', async () => {
    const result = await service.create({ matchId: 1, teamId: 1 });
    expect(result.matchId).toBe(1);
    expect(result.teamId).toBe(1);
  });
});
