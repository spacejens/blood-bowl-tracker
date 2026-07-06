import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

const fakeMatch = {
  id: 1,
  competitionId: 1,
  playedAt: new Date('2026-01-15'),
  createdAt: new Date('2026-01-15'),
};

describe('MatchesController', () => {
  let controller: MatchesController;
  const mockService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [{ provide: MatchesService, useValue: mockService }],
    }).compile();
    controller = module.get(MatchesController);
  });

  it('list returns all matches', async () => {
    mockService.findAll.mockResolvedValue([fakeMatch]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeMatch]);
  });

  it('getById returns the match when found', async () => {
    mockService.findById.mockResolvedValue(fakeMatch);
    const handlers = controller.handler();
    const result = await call(handlers.getById, { id: 1 });
    expect(mockService.findById).toHaveBeenCalledWith(1);
    expect(result).toEqual(fakeMatch);
  });

  it('getById throws NOT_FOUND when the match is not found', async () => {
    mockService.findById.mockResolvedValue(undefined);
    const handlers = controller.handler();
    await expect(call(handlers.getById, { id: 999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Match not found',
    });
  });

  it('create inserts and returns the new match', async () => {
    mockService.create.mockResolvedValue(fakeMatch);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      competitionId: 1,
      playedAt: new Date('2026-01-15'),
    });
    expect(mockService.create).toHaveBeenCalledWith({
      competitionId: 1,
      playedAt: new Date('2026-01-15'),
    });
    expect(result).toEqual(fakeMatch);
  });
});
