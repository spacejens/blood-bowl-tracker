import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

const fakeMatch = {
  id: 1,
  competitionId: 1,
  playedAt: new Date('2026-01-15'),
  createdAt: new Date('2026-01-15'),
};

interface MatchesHandlers {
  list: () => Promise<unknown>;
  getById: (args: { params: { id: number } }) => Promise<unknown>;
  create: (args: {
    body: { competitionId: number; playedAt: Date };
  }) => Promise<unknown>;
}

describe('MatchesController', () => {
  let controller: MatchesController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<MatchesHandlers> {
    return (await controller.handler()) as MatchesHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [{ provide: MatchesService, useValue: mockService }],
    }).compile();
    controller = module.get(MatchesController);
  });

  it('list returns all matches with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeMatch]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeMatch] });
  });

  it('getById returns the match with status 200 when found', async () => {
    mockService.findById.mockResolvedValue(fakeMatch);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 1 } });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: fakeMatch });
  });

  it('getById returns 404 when the match is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = await getHandlers();
    const result = await handlers.getById({ params: { id: 999 } });
    expect(result).toEqual({
      status: 404,
      body: { message: 'Match not found' },
    });
  });

  it('create inserts and returns the new match with status 201', async () => {
    mockService.create.mockResolvedValue(fakeMatch);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { competitionId: 1, playedAt: new Date('2026-01-15') },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      competitionId: 1,
      playedAt: new Date('2026-01-15'),
    });
    expect(result).toEqual({ status: 201, body: fakeMatch });
  });
});
