import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { RaceRulesSetsService } from './race-rules-sets.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeRaceRulesSet = { raceId: 1, rulesSetId: 1 };

describe('RaceRulesSetsService', () => {
  let service: RaceRulesSetsService;

  beforeEach(async () => {
    const selectChain = { from: vi.fn().mockResolvedValue([fakeRaceRulesSet]) };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeRaceRulesSet]),
      })),
    };
    const mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [RaceRulesSetsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(RaceRulesSetsService);
  });

  it('findAll returns a list of race-rules-set associations', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeRaceRulesSet]);
  });

  it('create inserts and returns the new association', async () => {
    const result = await service.create({ raceId: 1, rulesSetId: 1 });
    expect(result.raceId).toBe(1);
    expect(result.rulesSetId).toBe(1);
  });
});
