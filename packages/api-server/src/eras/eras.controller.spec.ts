import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ErasController } from './eras.controller';
import { ErasService } from './eras.service';

const fakeEra = {
  id: 1,
  name: 'Spring 2026',
  leagueId: 1,
  rulesSetId: 1,
  externalSystemId: 1,
  startDate: '2026-01-01',
  createdAt: new Date('2026-01-01'),
};

interface ErasHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: {
    body: {
      name: string;
      leagueId: number;
      rulesSetId: number;
      externalSystemId: number;
      startDate: string;
    };
  }) => Promise<unknown>;
}

describe('ErasController', () => {
  let controller: ErasController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<ErasHandlers> {
    return (await controller.handler()) as ErasHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ErasController],
      providers: [{ provide: ErasService, useValue: mockService }],
    }).compile();
    controller = module.get(ErasController);
  });

  it('list returns all eras with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeEra]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeEra] });
  });

  it('getById returns the era with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeEra);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeEra });
  });

  it('getById returns 404 when the era is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Era not found' },
    });
  });

  it('create inserts and returns the new era with status 201', async () => {
    mockService.create.mockResolvedValue(fakeEra);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: {
        name: 'Spring 2026',
        leagueId: 1,
        rulesSetId: 1,
        externalSystemId: 1,
        startDate: '2026-01-01',
      },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Spring 2026',
      leagueId: 1,
      rulesSetId: 1,
      externalSystemId: 1,
      startDate: '2026-01-01',
    });
    expect(result).toEqual({ status: 201, body: fakeEra });
  });
});
