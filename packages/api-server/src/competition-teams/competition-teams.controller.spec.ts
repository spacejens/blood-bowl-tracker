import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { CompetitionTeamsController } from './competition-teams.controller';
import { CompetitionTeamsService } from './competition-teams.service';

const fakeCompetitionTeam = { competitionId: 1, teamEraId: 1 };

interface CompetitionTeamsHandlers {
  list: () => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('CompetitionTeamsController', () => {
  let controller: CompetitionTeamsController;
  const mockService = {
    findAll: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<CompetitionTeamsHandlers> {
    return (await controller.handler()) as CompetitionTeamsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CompetitionTeamsController],
      providers: [{ provide: CompetitionTeamsService, useValue: mockService }],
    }).compile();
    controller = module.get(CompetitionTeamsController);
  });

  it('list returns all competition teams with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeCompetitionTeam]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeCompetitionTeam] });
  });

  it('create inserts and returns the new competition team with status 201', async () => {
    mockService.create.mockResolvedValue(fakeCompetitionTeam);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { competitionId: 1, teamEraId: 1 },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      competitionId: 1,
      teamEraId: 1,
    });
    expect(result).toEqual({ status: 201, body: fakeCompetitionTeam });
  });
});
