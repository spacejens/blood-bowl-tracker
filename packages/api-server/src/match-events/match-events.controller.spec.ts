import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';

const fakeEvent = {
  id: 1,
  matchId: 1,
  actingTeamEraId: 1,
  consequenceTeamEraId: null,
  actingPlayerId: 3,
  consequencePlayerId: null,
  createdAt: new Date('2026-01-01'),
};

describe('MatchEventsController', () => {
  let controller: MatchEventsController;
  const mockService = {
    findByMatchId: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MatchEventsController],
      providers: [{ provide: MatchEventsService, useValue: mockService }],
    }).compile();
    controller = module.get(MatchEventsController);
  });

  it('listByMatch returns the events for the given match', async () => {
    mockService.findByMatchId.mockResolvedValue([fakeEvent]);
    const handlers = controller.handler();
    const result = await call(handlers.listByMatch, { matchId: 1 });
    expect(mockService.findByMatchId).toHaveBeenCalledWith(1);
    expect(result).toEqual([fakeEvent]);
  });

  it('create inserts and returns the new match event', async () => {
    mockService.create.mockResolvedValue(fakeEvent);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      matchId: 1,
      actingTeamEraId: 1,
    });
    expect(mockService.create).toHaveBeenCalledWith({
      matchId: 1,
      actingTeamEraId: 1,
    });
    expect(result).toEqual(fakeEvent);
  });
});
