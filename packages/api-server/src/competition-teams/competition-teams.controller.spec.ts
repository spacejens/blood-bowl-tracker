import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { CompetitionTeamsController } from './competition-teams.controller';
import { CompetitionTeamsService } from './competition-teams.service';

const fakeCompetitionTeam = { competitionId: 1, teamEraId: 1 };

describe('CompetitionTeamsController', () => {
  let controller: CompetitionTeamsController;
  const mockService = {
    findAll: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CompetitionTeamsController],
      providers: [{ provide: CompetitionTeamsService, useValue: mockService }],
    }).compile();
    controller = module.get(CompetitionTeamsController);
  });

  it('list returns all competition teams', async () => {
    mockService.findAll.mockResolvedValue([fakeCompetitionTeam]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeCompetitionTeam]);
  });

  it('create inserts and returns the new competition team', async () => {
    mockService.create.mockResolvedValue(fakeCompetitionTeam);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      competitionId: 1,
      teamEraId: 1,
    });
    expect(mockService.create).toHaveBeenCalledWith({
      competitionId: 1,
      teamEraId: 1,
    });
    expect(result).toEqual(fakeCompetitionTeam);
  });
});
