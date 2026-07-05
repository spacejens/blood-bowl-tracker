import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { CoachesController } from './coaches.controller';
import { CoachesService, CoachUpsertConflictError } from './coaches.service';

const fakeCoach = {
  id: 1,
  name: 'Roze Madder',
  createdAt: new Date('2026-01-01'),
};

interface CoachesHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: { body: { name: string } }) => Promise<unknown>;
  upsert: (args: {
    body: {
      name: string;
      externalIds: { externalSystemId: number; externalId: string }[];
    };
  }) => Promise<unknown>;
}

describe('CoachesController', () => {
  let controller: CoachesController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  };

  async function getHandlers(): Promise<CoachesHandlers> {
    return (await controller.handler()) as CoachesHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CoachesController],
      providers: [{ provide: CoachesService, useValue: mockService }],
    }).compile();
    controller = module.get(CoachesController);
  });

  it('list returns all coaches with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeCoach]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeCoach] });
  });

  it('getById returns the coach with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeCoach);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeCoach });
  });

  it('getById returns 404 when the coach is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Coach not found' },
    });
  });

  it('create inserts and returns the new coach with status 201', async () => {
    mockService.create.mockResolvedValue(fakeCoach);
    const handlers = await getHandlers();
    const result = await handlers.create({ body: { name: 'Roze Madder' } });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'Roze Madder' });
    expect(result).toEqual({ status: 201, body: fakeCoach });
  });

  it('upsert returns 201 when a new coach was created', async () => {
    mockService.upsert.mockResolvedValue({ coach: fakeCoach, created: true });
    const handlers = await getHandlers();
    const result = await handlers.upsert({
      body: { name: 'Roze Madder', externalIds: [] },
    });
    expect(result).toEqual({ status: 201, body: fakeCoach });
  });

  it('upsert returns 200 when an existing coach was updated', async () => {
    mockService.upsert.mockResolvedValue({ coach: fakeCoach, created: false });
    const handlers = await getHandlers();
    const result = await handlers.upsert({
      body: { name: 'Roze Madder', externalIds: [] },
    });
    expect(result).toEqual({ status: 200, body: fakeCoach });
  });

  it('upsert returns 409 when external IDs match multiple coaches', async () => {
    mockService.upsert.mockRejectedValue(
      new CoachUpsertConflictError(
        'External IDs matched multiple existing coaches: 1, 2',
      ),
    );
    const handlers = await getHandlers();
    const result = await handlers.upsert({
      body: { name: 'Roze Madder', externalIds: [] },
    });
    expect(result).toEqual({
      status: 409,
      body: { message: 'External IDs matched multiple existing coaches: 1, 2' },
    });
  });

  it('upsert rethrows errors that are not a conflict', async () => {
    mockService.upsert.mockRejectedValue(new Error('db unavailable'));
    const handlers = await getHandlers();
    await expect(
      handlers.upsert({ body: { name: 'Roze Madder', externalIds: [] } }),
    ).rejects.toThrow('db unavailable');
  });
});
