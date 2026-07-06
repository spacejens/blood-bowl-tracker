import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { RacesController } from './races.controller';
import { RacesService } from './races.service';

const fakeRace = {
  id: 1,
  name: 'Orc',
  createdAt: new Date('2026-01-01'),
};

describe('RacesController', () => {
  let controller: RacesController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [RacesController],
      providers: [{ provide: RacesService, useValue: mockService }],
    }).compile();
    controller = module.get(RacesController);
  });

  it('list returns all races', async () => {
    mockService.findAll.mockResolvedValue([fakeRace]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeRace]);
  });

  it('getById returns the race when found', async () => {
    mockService.findById.mockResolvedValue(fakeRace);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeRace);
  });

  it('getById throws NOT_FOUND when the race is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Race not found',
    });
  });

  it('create inserts and returns the new race', async () => {
    mockService.create.mockResolvedValue(fakeRace);
    const handlers = controller.handler();
    const result = await call(handlers.create, { name: 'Orc' });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'Orc' });
    expect(result).toEqual(fakeRace);
  });
});
