import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

const fakePlayer = {
  id: 1,
  name: 'Grak',
  teamEraId: 1,
  positionId: 1,
  createdAt: new Date('2026-01-01'),
};

interface PlayersHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('PlayersController', () => {
  let controller: PlayersController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<PlayersHandlers> {
    return (await controller.handler()) as PlayersHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PlayersController],
      providers: [{ provide: PlayersService, useValue: mockService }],
    }).compile();
    controller = module.get(PlayersController);
  });

  it('list returns all players with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakePlayer]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakePlayer] });
  });

  it('getById returns the player with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakePlayer);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakePlayer });
  });

  it('getById returns 404 when the player is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Player not found' },
    });
  });

  it('create inserts and returns the new player with status 201', async () => {
    mockService.create.mockResolvedValue(fakePlayer);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { name: 'Grak', teamEraId: 1, positionId: 1 },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Grak',
      teamEraId: 1,
      positionId: 1,
    });
    expect(result).toEqual({ status: 201, body: fakePlayer });
  });
});
