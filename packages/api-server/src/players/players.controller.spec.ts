import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

const fakePlayer = {
  id: 1,
  name: 'Grak',
  teamEraId: 1,
  positionId: 1,
  createdAt: new Date('2026-01-01'),
};

describe('PlayersController', () => {
  let controller: PlayersController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PlayersController],
      providers: [{ provide: PlayersService, useValue: mockService }],
    }).compile();
    controller = module.get(PlayersController);
  });

  it('list returns all players', async () => {
    mockService.findAll.mockResolvedValue([fakePlayer]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakePlayer]);
  });

  it('getById returns the player when found', async () => {
    mockService.findById.mockResolvedValue(fakePlayer);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakePlayer);
  });

  it('getById throws NOT_FOUND when the player is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Player not found',
    });
  });

  it('create inserts and returns the new player', async () => {
    mockService.create.mockResolvedValue(fakePlayer);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      name: 'Grak',
      teamEraId: 1,
      positionId: 1,
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Grak',
      teamEraId: 1,
      positionId: 1,
    });
    expect(result).toEqual(fakePlayer);
  });
});
