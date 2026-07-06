import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { TeamErasController } from './team-eras.controller';
import { TeamErasService } from './team-eras.service';

const fakeTeamEra = {
  id: 1,
  teamId: 1,
  eraId: 1,
  createdAt: new Date('2026-01-01'),
};

describe('TeamErasController', () => {
  let controller: TeamErasController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [TeamErasController],
      providers: [{ provide: TeamErasService, useValue: mockService }],
    }).compile();
    controller = module.get(TeamErasController);
  });

  it('list returns all team eras', async () => {
    mockService.findAll.mockResolvedValue([fakeTeamEra]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeTeamEra]);
  });

  it('getById returns the team era when found', async () => {
    mockService.findById.mockResolvedValue(fakeTeamEra);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeTeamEra);
  });

  it('getById throws NOT_FOUND when the team era is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Team era not found',
    });
  });

  it('create inserts and returns the new team era', async () => {
    mockService.create.mockResolvedValue(fakeTeamEra);
    const handlers = controller.handler();
    const result = await call(handlers.create, { teamId: 1, eraId: 1 });
    expect(mockService.create).toHaveBeenCalledWith({ teamId: 1, eraId: 1 });
    expect(result).toEqual(fakeTeamEra);
  });
});
