import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

const fakePosition = {
  id: 1,
  name: 'Blitzer',
  raceId: 1,
  createdAt: new Date('2026-01-01'),
};

describe('PositionsController', () => {
  let controller: PositionsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PositionsController],
      providers: [{ provide: PositionsService, useValue: mockService }],
    }).compile();
    controller = module.get(PositionsController);
  });

  it('list returns all positions', async () => {
    mockService.findAll.mockResolvedValue([fakePosition]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakePosition]);
  });

  it('getById returns the position when found', async () => {
    mockService.findById.mockResolvedValue(fakePosition);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakePosition);
  });

  it('getById throws NOT_FOUND when the position is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Position not found',
    });
  });

  it('create inserts and returns the new position', async () => {
    mockService.create.mockResolvedValue(fakePosition);
    const handlers = controller.handler();
    const result = await call(handlers.create, { name: 'Blitzer', raceId: 1 });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Blitzer',
      raceId: 1,
    });
    expect(result).toEqual(fakePosition);
  });
});
