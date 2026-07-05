import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { RaceRulesSetsController } from './race-rules-sets.controller';
import { RaceRulesSetsService } from './race-rules-sets.service';

const fakeRaceRulesSet = { raceId: 1, rulesSetId: 1 };

interface RaceRulesSetsHandlers {
  list: () => Promise<unknown>;
  create: (args: { body: unknown }) => Promise<unknown>;
}

describe('RaceRulesSetsController', () => {
  let controller: RaceRulesSetsController;
  const mockService = {
    findAll: vi.fn(),
    create: vi.fn(),
  };

  async function getHandlers(): Promise<RaceRulesSetsHandlers> {
    return (await controller.handler()) as RaceRulesSetsHandlers;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [RaceRulesSetsController],
      providers: [{ provide: RaceRulesSetsService, useValue: mockService }],
    }).compile();
    controller = module.get(RaceRulesSetsController);
  });

  it('list returns all race rules sets with status 200', async () => {
    mockService.findAll.mockResolvedValue([fakeRaceRulesSet]);
    const handlers = await getHandlers();
    const result = await handlers.list();
    expect(result).toEqual({ status: 200, body: [fakeRaceRulesSet] });
  });

  it('create inserts and returns the new race rules set with status 201', async () => {
    mockService.create.mockResolvedValue(fakeRaceRulesSet);
    const handlers = await getHandlers();
    const result = await handlers.create({
      body: { raceId: 1, rulesSetId: 1 },
    });
    expect(mockService.create).toHaveBeenCalledWith({
      raceId: 1,
      rulesSetId: 1,
    });
    expect(result).toEqual({ status: 201, body: fakeRaceRulesSet });
  });
});
