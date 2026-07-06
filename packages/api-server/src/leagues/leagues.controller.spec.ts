import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { LeaguesController } from './leagues.controller';
import { LeaguesService } from './leagues.service';

const fakeLeague = {
  id: 1,
  name: 'The Bad Cup',
  createdAt: new Date('2026-01-01'),
};

describe('LeaguesController', () => {
  let controller: LeaguesController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [LeaguesController],
      providers: [{ provide: LeaguesService, useValue: mockService }],
    }).compile();
    controller = module.get(LeaguesController);
  });

  it('list returns all leagues', async () => {
    mockService.findAll.mockResolvedValue([fakeLeague]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeLeague]);
  });

  it('getById returns the league when found', async () => {
    mockService.findById.mockResolvedValue(fakeLeague);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeLeague);
  });

  it('getById throws NOT_FOUND when the league is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'League not found',
    });
  });

  it('create inserts and returns the new league', async () => {
    mockService.create.mockResolvedValue(fakeLeague);
    const handlers = controller.handler();
    const result = await call(handlers.create, { name: 'The Bad Cup' });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'The Bad Cup' });
    expect(result).toEqual(fakeLeague);
  });
});
