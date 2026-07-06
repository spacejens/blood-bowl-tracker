import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

const fakeTeam = {
  id: 1,
  name: 'Orcland Raiders',
  raceId: 1,
  coachId: 1,
  createdAt: new Date('2026-01-01'),
};

describe('TeamsController', () => {
  let controller: TeamsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [{ provide: TeamsService, useValue: mockService }],
    }).compile();
    controller = module.get(TeamsController);
  });

  it('list returns all teams', async () => {
    mockService.findAll.mockResolvedValue([fakeTeam]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeTeam]);
  });

  it('getById returns the team when found', async () => {
    mockService.findById.mockResolvedValue(fakeTeam);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeTeam);
  });

  it('getById throws NOT_FOUND when the team is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Team not found',
    });
  });

  it('create inserts and returns the new team', async () => {
    mockService.create.mockResolvedValue(fakeTeam);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      name: 'Orcland Raiders',
      raceId: 1,
      coachId: 1,
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Orcland Raiders',
      raceId: 1,
      coachId: 1,
    });
    expect(result).toEqual(fakeTeam);
  });
});
