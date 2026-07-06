import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { CoachesController } from './coaches.controller';
import { CoachesService, CoachUpsertConflictError } from './coaches.service';

const fakeCoach = {
  id: 1,
  name: 'Roze Madder',
  createdAt: new Date('2026-01-01'),
};

describe('CoachesController', () => {
  let controller: CoachesController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CoachesController],
      providers: [{ provide: CoachesService, useValue: mockService }],
    }).compile();
    controller = module.get(CoachesController);
  });

  it('list returns all coaches', async () => {
    mockService.findAll.mockResolvedValue([fakeCoach]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeCoach]);
  });

  it('getById returns the coach when found', async () => {
    mockService.findById.mockResolvedValue(fakeCoach);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeCoach);
  });

  it('getById throws NOT_FOUND when the coach is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Coach not found',
    });
  });

  it('create inserts and returns the new coach', async () => {
    mockService.create.mockResolvedValue(fakeCoach);
    const handlers = controller.handler();
    const result = await call(handlers.create, { name: 'Roze Madder' });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'Roze Madder' });
    expect(result).toEqual(fakeCoach);
  });

  it('upsert returns created: true when a new coach was created', async () => {
    mockService.upsert.mockResolvedValue({ coach: fakeCoach, created: true });
    const handlers = controller.handler();
    const result = await call(handlers.upsert, {
      name: 'Roze Madder',
      externalIds: [{ externalSystemId: 1, externalId: 'ext-1' }],
    });
    expect(result).toEqual({ ...fakeCoach, created: true });
  });

  it('upsert returns created: false when an existing coach was updated', async () => {
    mockService.upsert.mockResolvedValue({ coach: fakeCoach, created: false });
    const handlers = controller.handler();
    const result = await call(handlers.upsert, {
      name: 'Roze Madder',
      externalIds: [{ externalSystemId: 1, externalId: 'ext-1' }],
    });
    expect(result).toEqual({ ...fakeCoach, created: false });
  });

  it('upsert throws CONFLICT when external IDs match multiple coaches', async () => {
    mockService.upsert.mockRejectedValue(
      new CoachUpsertConflictError(
        'External IDs matched multiple existing coaches: 1, 2',
      ),
    );
    const handlers = controller.handler();
    await expect(
      call(handlers.upsert, {
        name: 'Roze Madder',
        externalIds: [{ externalSystemId: 1, externalId: 'ext-1' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing coaches: 1, 2',
    });
  });

  it('upsert rethrows errors that are not a conflict', async () => {
    mockService.upsert.mockRejectedValue(new Error('db unavailable'));
    const handlers = controller.handler();
    await expect(
      call(handlers.upsert, {
        name: 'Roze Madder',
        externalIds: [{ externalSystemId: 1, externalId: 'ext-1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });
});
