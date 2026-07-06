import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { RaceRulesSetsController } from './race-rules-sets.controller';
import { RaceRulesSetsService } from './race-rules-sets.service';

const fakeRaceRulesSet = { raceId: 1, rulesSetId: 1 };

describe('RaceRulesSetsController', () => {
  let controller: RaceRulesSetsController;
  const mockService = {
    findAll: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [RaceRulesSetsController],
      providers: [{ provide: RaceRulesSetsService, useValue: mockService }],
    }).compile();
    controller = module.get(RaceRulesSetsController);
  });

  it('list returns all race rules sets', async () => {
    mockService.findAll.mockResolvedValue([fakeRaceRulesSet]);
    const handlers = controller.handler();
    const result = await call(handlers.list, undefined);
    expect(result).toEqual([fakeRaceRulesSet]);
  });

  it('create inserts and returns the new race rules set', async () => {
    mockService.create.mockResolvedValue(fakeRaceRulesSet);
    const handlers = controller.handler();
    const result = await call(handlers.create, {
      raceId: 1,
      rulesSetId: 1,
    });
    expect(mockService.create).toHaveBeenCalledWith({
      raceId: 1,
      rulesSetId: 1,
    });
    expect(result).toEqual(fakeRaceRulesSet);
  });
});
