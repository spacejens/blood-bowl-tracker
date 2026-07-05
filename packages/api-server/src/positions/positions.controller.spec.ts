import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

const fakePosition = {
  id: 1,
  name: 'Blitzer',
  raceId: 1,
  createdAt: new Date('2026-01-01'),
};

interface PositionsHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: {
    body: { name: string; raceId: number };
  }) => Promise<unknown>;
}

describe('PositionsController', () => {
  let controller: PositionsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<PositionsHandlers> {
    return (await controller.handler()) as PositionsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PositionsController],
      providers: [{ provide: PositionsService, useValue: mockService }],
    }).compile();
    controller = module.get(PositionsController);
  });

  it('list returns all positions with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakePosition]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakePosition] });
  });

  it('getById returns the position with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakePosition);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakePosition });
  });

  it('getById returns 404 when the position is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Position not found' },
    });
  });

  it('create inserts and returns the new position with status 201', async () => {
    mockService.create.mockResolvedValue(fakePosition);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { name: 'Blitzer', raceId: 1 },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Blitzer',
      raceId: 1,
    });
    expect(result).toEqual({ status: 201, body: fakePosition });
  });
});
