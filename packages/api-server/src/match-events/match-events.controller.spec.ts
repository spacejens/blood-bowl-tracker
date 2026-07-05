import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MatchEventsController } from './match-events.controller';
import { MatchEventsService } from './match-events.service';

const fakeEvent = {
  id: 1,
  matchId: 1,
  actingTeamEraId: 1,
  consequenceTeamEraId: null,
  actingPlayerId: 3,
  consequencePlayerId: null,
};

interface MatchEventsHandlers {
  listByMatch: (args: { params: { matchId: number } }) => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('MatchEventsController', () => {
  let controller: MatchEventsController;
  const mockService = {
    findByMatchId: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<MatchEventsHandlers> {
    return (await controller.handler()) as MatchEventsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MatchEventsController],
      providers: [{ provide: MatchEventsService, useValue: mockService }],
    }).compile();
    controller = module.get(MatchEventsController);
  });

  it('listByMatch returns the events for the given match with status 200', async () => {
    mockService.findByMatchId.mockResolvedValue([fakeEvent]);
    const handlers = await getHandlers();
    const result = await handlers.listByMatch({ params: { matchId: 1 } });
    expect(mockService.findByMatchId).toHaveBeenCalledWith(1);
    expect(result).toEqual({ status: 200, body: [fakeEvent] });
  });

  it('create inserts and returns the new match event with status 201', async () => {
    mockService.create.mockResolvedValue(fakeEvent);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { matchId: 1, actingTeamEraId: 1 },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      matchId: 1,
      actingTeamEraId: 1,
    });
    expect(result).toEqual({ status: 201, body: fakeEvent });
  });
});
