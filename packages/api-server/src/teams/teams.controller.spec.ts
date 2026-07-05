import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

const fakeTeam = {
  id: 1,
  name: 'Orcland Raiders',
  raceId: 1,
  coachId: 1,
  createdAt: new Date('2026-01-01'),
};

interface TeamsHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('TeamsController', () => {
  let controller: TeamsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<TeamsHandlers> {
    return (await controller.handler()) as TeamsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [{ provide: TeamsService, useValue: mockService }],
    }).compile();
    controller = module.get(TeamsController);
  });

  it('list returns all teams with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeTeam]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeTeam] });
  });

  it('getById returns the team with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeTeam);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeTeam });
  });

  it('getById returns 404 when the team is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Team not found' },
    });
  });

  it('create inserts and returns the new team with status 201', async () => {
    mockService.create.mockResolvedValue(fakeTeam);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { name: 'Orcland Raiders', raceId: 1, coachId: 1 },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Orcland Raiders',
      raceId: 1,
      coachId: 1,
    });
    expect(result).toEqual({ status: 201, body: fakeTeam });
  });
});
