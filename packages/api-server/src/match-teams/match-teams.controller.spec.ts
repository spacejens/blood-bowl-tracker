import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { MatchTeamsController } from './match-teams.controller';
import { MatchTeamsService } from './match-teams.service';

const fakeMatchTeam = { matchId: 1, teamEraId: 1 };

describe('MatchTeamsController', () => {
  let controller: MatchTeamsController;
  const mockService = {
    findAll: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MatchTeamsController],
      providers: [{ provide: MatchTeamsService, useValue: mockService }],
    }).compile();
    controller = module.get(MatchTeamsController);
  });

  it('list returns all match teams', async () => {
    mockService.findAll.mockResolvedValue([fakeMatchTeam]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeMatchTeam]);
  });

  it('create inserts and returns the new match team', async () => {
    mockService.create.mockResolvedValue(fakeMatchTeam);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      matchId: 1,
      teamEraId: 1,
    });
    expect(mockService.create).toHaveBeenCalledWith({
      matchId: 1,
      teamEraId: 1,
    });
    expect(result).toEqual(fakeMatchTeam);
  });
});
