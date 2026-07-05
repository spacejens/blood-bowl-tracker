import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MatchTeamsController } from './match-teams.controller';
import { MatchTeamsService } from './match-teams.service';

const fakeMatchTeam = { matchId: 1, teamEraId: 1 };

interface MatchTeamsHandlers {
  list: () => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('MatchTeamsController', () => {
  let controller: MatchTeamsController;
  const mockService = {
    findAll: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<MatchTeamsHandlers> {
    return (await controller.handler()) as MatchTeamsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MatchTeamsController],
      providers: [{ provide: MatchTeamsService, useValue: mockService }],
    }).compile();
    controller = module.get(MatchTeamsController);
  });

  it('list returns all match teams with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeMatchTeam]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeMatchTeam] });
  });

  it('create inserts and returns the new match team with status 201', async () => {
    mockService.create.mockResolvedValue(fakeMatchTeam);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { matchId: 1, teamEraId: 1 },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      matchId: 1,
      teamEraId: 1,
    });
    expect(result).toEqual({ status: 201, body: fakeMatchTeam });
  });
});
