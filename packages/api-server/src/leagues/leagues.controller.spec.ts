import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { LeaguesController } from './leagues.controller';
import { LeaguesService } from './leagues.service';

const fakeLeague = {
  id: 1,
  name: 'The Bad Cup',
  createdAt: new Date('2026-01-01'),
};

interface LeaguesHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: { body: { name: string } }) => Promise<unknown>;
}

describe('LeaguesController', () => {
  let controller: LeaguesController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<LeaguesHandlers> {
    return (await controller.handler()) as LeaguesHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [LeaguesController],
      providers: [{ provide: LeaguesService, useValue: mockService }],
    }).compile();
    controller = module.get(LeaguesController);
  });

  it('list returns all leagues with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeLeague]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeLeague] });
  });

  it('getById returns the league with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeLeague);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeLeague });
  });

  it('getById returns 404 when the league is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'League not found' },
    });
  });

  it('create inserts and returns the new league with status 201', async () => {
    mockService.create.mockResolvedValue(fakeLeague);
    const handlers = await getHandlers();
    const result = await handlers.create({ body: { name: 'The Bad Cup' } });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'The Bad Cup' });
    expect(result).toEqual({ status: 201, body: fakeLeague });
  });
});
