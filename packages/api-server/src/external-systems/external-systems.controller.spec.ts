import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { ExternalSystemsController } from './external-systems.controller';
import { ExternalSystemsService } from './external-systems.service';

const fakeSystem = {
  id: 1,
  name: 'BBL',
  createdAt: new Date('2026-01-01'),
};

describe('ExternalSystemsController', () => {
  let controller: ExternalSystemsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ExternalSystemsController],
      providers: [{ provide: ExternalSystemsService, useValue: mockService }],
    }).compile();
    controller = module.get(ExternalSystemsController);
  });

  it('list returns all external systems', async () => {
    mockService.findAll.mockResolvedValue([fakeSystem]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeSystem]);
  });

  it('getById returns the system when found', async () => {
    mockService.findById.mockResolvedValue(fakeSystem);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeSystem);
  });

  it('getById throws NOT_FOUND when the system is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'External system not found',
    });
  });

  it('create inserts and returns the new system', async () => {
    mockService.create.mockResolvedValue(fakeSystem);
    const handlers = controller.handler();
    const result = await call(handlers.create, { name: 'BBL' });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'BBL' });
    expect(result).toEqual(fakeSystem);
  });

  it('upsert returns created: true when a new system was created', async () => {
    mockService.upsert.mockResolvedValue({
      system: fakeSystem,
      created: true,
    });
    const handlers = controller.handler();
    const result = await call(handlers.upsert, { name: 'BBL' });
    expect(result).toEqual({ ...fakeSystem, created: true });
  });

  it('upsert returns created: false when an existing system was matched', async () => {
    mockService.upsert.mockResolvedValue({
      system: fakeSystem,
      created: false,
    });
    const handlers = controller.handler();
    const result = await call(handlers.upsert, { name: 'BBL' });
    expect(result).toEqual({ ...fakeSystem, created: false });
  });
});
