import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { TeamErasController } from './team-eras.controller';
import { TeamErasService } from './team-eras.service';

const fakeTeamEra = {
  id: 1,
  teamId: 1,
  eraId: 1,
  createdAt: new Date('2026-01-01'),
};

interface TeamErasHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('TeamErasController', () => {
  let controller: TeamErasController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<TeamErasHandlers> {
    return (await controller.handler()) as TeamErasHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [TeamErasController],
      providers: [{ provide: TeamErasService, useValue: mockService }],
    }).compile();
    controller = module.get(TeamErasController);
  });

  it('list returns all team eras with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeTeamEra]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeTeamEra] });
  });

  it('getById returns the team era with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeTeamEra);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeTeamEra });
  });

  it('getById returns 404 when the team era is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Team era not found' },
    });
  });

  it('create inserts and returns the new team era with status 201', async () => {
    mockService.create.mockResolvedValue(fakeTeamEra);
    const handlers = await getHandlers();
    const result = await handlers.create({ body: { teamId: 1, eraId: 1 } });
    expect(mockService.create).toHaveBeenCalledWith({ teamId: 1, eraId: 1 });
    expect(result).toEqual({ status: 201, body: fakeTeamEra });
  });
});
