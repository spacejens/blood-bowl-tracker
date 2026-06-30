import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { CompetitionTeamsService } from './competition-teams.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeCompetitionTeam = { competitionId: 1, teamId: 1 };

describe('CompetitionTeamsService', () => {
  let service: CompetitionTeamsService;

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockResolvedValue([fakeCompetitionTeam]),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCompetitionTeam]),
      })),
    };
    const mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [CompetitionTeamsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(CompetitionTeamsService);
  });

  it('findAll returns a list of competition-team associations', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeCompetitionTeam]);
  });

  it('create inserts and returns the new association', async () => {
    const result = await service.create({ competitionId: 1, teamId: 1 });
    expect(result.competitionId).toBe(1);
    expect(result.teamId).toBe(1);
  });
});
