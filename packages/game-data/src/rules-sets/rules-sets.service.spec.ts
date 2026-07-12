import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  raceRulesSets,
  rulesSetExternalIds,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RulesSetsService,
  RulesSetUpsertConflictError,
} from './rules-sets.service';

const fakeRulesSet = {
  id: 1,
  name: 'BB2020',
  createdAt: new Date('2026-01-01'),
};

function makeFromBuilder(rows: unknown[]) {
  return {
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
}

describe('RulesSetsService', () => {
  let service: RulesSetsService;
  let externalIdRows: unknown[];
  let existingRaceRows: { raceId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingRaceRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === rulesSetExternalIds ? externalIdRows : existingRaceRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakeRulesSet]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({ returning: () => Promise.resolve([fakeRulesSet]) }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [RulesSetsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(RulesSetsService);
  });

  const baseData = {
    name: 'BB2020',
    races: [7, 8],
    externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
  };

  it('creates a new rules set with its races when no external IDs match', async () => {
    const result = await service.upsert(baseData);

    expect(result).toEqual({
      rulesSet: { ...fakeRulesSet, races: [7, 8] },
      created: true,
    });
    expect(insertCalls.some((c) => c.table === rulesSets)).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('updates the matching rules set when exactly one external ID matches', async () => {
    externalIdRows = [
      { rulesSetId: 1, externalSystemId: 1, externalId: 'BB2020' },
    ];

    const result = await service.upsert(baseData);

    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === rulesSets)).toBe(true);
  });

  it('throws RulesSetUpsertConflictError when external IDs match different rules sets', async () => {
    externalIdRows = [
      { rulesSetId: 1, externalSystemId: 1, externalId: 'BB2020' },
      { rulesSetId: 2, externalSystemId: 2, externalId: 'BB2020' },
    ];

    await expect(service.upsert(baseData)).rejects.toThrow(
      RulesSetUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts only the race_rules_sets rows that are new', async () => {
    existingRaceRows = [{ raceId: 7 }];

    const result = await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === raceRulesSets);
    expect(call?.values).toEqual([{ rulesSetId: 1, raceId: 8 }]);
    expect(result.rulesSet.races).toEqual([7, 8]);
  });

  it('does not insert race_rules_sets rows when all links already exist', async () => {
    existingRaceRows = [{ raceId: 7 }, { raceId: 8 }];

    const result = await service.upsert(baseData);

    expect(insertCalls.some((c) => c.table === raceRulesSets)).toBe(false);
    expect(result.rulesSet.races).toEqual([7, 8]);
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new RulesSetsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });
});
