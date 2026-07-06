import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';

const fakeCompetition = {
  id: 1,
  name: 'Spring Season',
  type: 'season' as const,
  eraId: 1,
  createdAt: new Date('2026-01-01'),
};

describe('CompetitionsController', () => {
  let controller: CompetitionsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CompetitionsController],
      providers: [{ provide: CompetitionsService, useValue: mockService }],
    }).compile();
    controller = module.get(CompetitionsController);
  });

  it('list returns all competitions', async () => {
    mockService.findAll.mockResolvedValue([fakeCompetition]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeCompetition]);
  });

  it('getById returns the competition when found', async () => {
    mockService.findById.mockResolvedValue(fakeCompetition);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeCompetition);
  });

  it('getById throws NOT_FOUND when the competition is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Competition not found',
    });
  });

  it('create inserts and returns the new competition', async () => {
    mockService.create.mockResolvedValue(fakeCompetition);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      name: 'Spring Season',
      type: 'season',
      eraId: 1,
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Spring Season',
      type: 'season',
      eraId: 1,
    });
    expect(result).toEqual(fakeCompetition);
  });
});
