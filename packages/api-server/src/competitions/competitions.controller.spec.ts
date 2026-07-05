import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';

const fakeCompetition = {
  id: 1,
  name: 'Spring Season',
  type: 'season' as const,
  eraId: 1,
  createdAt: new Date('2026-01-01'),
};

interface CompetitionsHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: {
    body: { name: string; type: string; eraId: number };
  }) => Promise<unknown>;
}

describe('CompetitionsController', () => {
  let controller: CompetitionsController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<CompetitionsHandlers> {
    return (await controller.handler()) as CompetitionsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CompetitionsController],
      providers: [{ provide: CompetitionsService, useValue: mockService }],
    }).compile();
    controller = module.get(CompetitionsController);
  });

  it('list returns all competitions with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeCompetition]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeCompetition] });
  });

  it('getById returns the competition with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeCompetition);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeCompetition });
  });

  it('getById returns 404 when the competition is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Competition not found' },
    });
  });

  it('create inserts and returns the new competition with status 201', async () => {
    mockService.create.mockResolvedValue(fakeCompetition);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { name: 'Spring Season', type: 'season', eraId: 1 },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      name: 'Spring Season',
      type: 'season',
      eraId: 1,
    });
    expect(result).toEqual({ status: 201, body: fakeCompetition });
  });
});
