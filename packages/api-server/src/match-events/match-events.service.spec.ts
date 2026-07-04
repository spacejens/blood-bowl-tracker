import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MatchEventsService } from './match-events.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeEvent = {
  id: 1,
  matchId: 1,
  actingTeamEraId: 1,
  consequenceTeamEraId: null,
  actingPlayerId: 3,
  consequencePlayerId: null,
  createdAt: new Date('2026-01-15'),
};

describe('MatchEventsService', () => {
  let service: MatchEventsService;

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([fakeEvent]) })),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeEvent]),
      })),
    };
    const mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [MatchEventsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(MatchEventsService);
  });

  it('findByMatchId returns events for a match', async () => {
    const result = await service.findByMatchId(1);
    expect(result).toEqual([fakeEvent]);
  });

  it('create inserts and returns the new event', async () => {
    const result = await service.create({ matchId: 1, actingTeamEraId: 1 });
    expect(result.actingTeamEraId).toBe(1);
  });
});
