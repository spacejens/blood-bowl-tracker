import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { ErasController } from './eras.controller';
import { ErasService } from './eras.service';

const fakeEra = {
  id: 1,
  name: 'Spring 2026',
  leagueId: 1,
  rulesSetId: 1,
  externalSystemId: 1,
  startDate: '2026-01-01',
  endDate: null,
  createdAt: new Date('2026-01-01'),
};

describe('ErasController', () => {
  let controller: ErasController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ErasController],
      providers: [{ provide: ErasService, useValue: mockService }],
    }).compile();
    controller = module.get(ErasController);
  });

  it('list returns all eras', async () => {
    mockService.findAll.mockResolvedValue([fakeEra]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeEra]);
  });

  it('getById returns the era when found', async () => {
    mockService.findById.mockResolvedValue(fakeEra);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeEra);
  });

  it('getById throws NOT_FOUND when the era is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Era not found',
    });
  });

  it('create inserts and returns the new era', async () => {
    mockService.create.mockResolvedValue(fakeEra);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      name: 'Spring 2026',
      leagueId: 1,
      rulesSetId: 1,
      externalSystemId: 1,
      startDate: '2026-01-01',
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Spring 2026',
      leagueId: 1,
      rulesSetId: 1,
      externalSystemId: 1,
      startDate: '2026-01-01',
    });
    expect(result).toEqual(fakeEra);
  });
});
