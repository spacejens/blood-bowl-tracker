import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ExternalSystemsController } from './external-systems.controller';
import { ExternalSystemsService } from './external-systems.service';

const fakeSystem = {
  id: 1,
  name: 'BBL',
  createdAt: new Date('2026-01-01'),
};

interface ExternalSystemsHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: { body: { name: string } }) => Promise<unknown>;
  upsert: (args: { body: { name: string } }) => Promise<unknown>;
}

describe('ExternalSystemsController', () => {
  let controller: ExternalSystemsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  };

  async function getHandlers(): Promise<ExternalSystemsHandlers> {
    return (await controller.handler()) as ExternalSystemsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ExternalSystemsController],
      providers: [{ provide: ExternalSystemsService, useValue: mockService }],
    }).compile();
    controller = module.get(ExternalSystemsController);
  });

  it('list returns all external systems with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeSystem]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeSystem] });
  });

  it('getById returns the system with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeSystem);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeSystem });
  });

  it('getById returns 404 when the system is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'External system not found' },
    });
  });

  it('create inserts and returns the new system with status 201', async () => {
    mockService.create.mockResolvedValue(fakeSystem);
    const handlers = await getHandlers();
    const result = await handlers.create({ body: { name: 'BBL' } });
    expect(mockService.create).toHaveBeenCalledWith({ name: 'BBL' });
    expect(result).toEqual({ status: 201, body: fakeSystem });
  });

  it('upsert returns 201 when a new system was created', async () => {
    mockService.upsert.mockResolvedValue({ system: fakeSystem, created: true });
    const handlers = await getHandlers();
    const result = await handlers.upsert({ body: { name: 'BBL' } });
    expect(result).toEqual({ status: 201, body: fakeSystem });
  });

  it('upsert returns 200 when an existing system was matched', async () => {
    mockService.upsert.mockResolvedValue({
      system: fakeSystem,
      created: false,
    });
    const handlers = await getHandlers();
    const result = await handlers.upsert({ body: { name: 'BBL' } });
    expect(result).toEqual({ status: 200, body: fakeSystem });
  });
});
