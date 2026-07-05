import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { RacesController } from './races.controller';
import { RacesService } from './races.service';

const fakeRace = {
  id: 1,
  name: 'Orc',
  createdAt: new Date('2026-01-01'),
};

interface RacesHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('RacesController', () => {
  let controller: RacesController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<RacesHandlers> {
    return (await controller.handler()) as RacesHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [RacesController],
      providers: [{ provide: RacesService, useValue: mockService }],
    }).compile();
    controller = module.get(RacesController);
  });

  it('list returns all races with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeRace]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeRace] });
  });

  it('getById returns the race with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeRace);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeRace });
  });

  it('getById returns 404 when the race is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Race not found' },
    });
  });

  it('create inserts and returns the new race with status 201', async () => {
    mockService.create.mockResolvedValue(fakeRace);
    const handlers = await getHandlers();
    const result = await handlers.create({ body: { name: 'Orc' } });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'Orc' });
    expect(result).toEqual({ status: 201, body: fakeRace });
  });
});
