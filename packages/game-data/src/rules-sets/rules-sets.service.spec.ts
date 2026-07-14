import type { Db } from '@blood-bowl-tracker/db';
import { DB, rulesSetExternalIds, rulesSets } from '@blood-bowl-tracker/db';
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
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(table === rulesSetExternalIds ? externalIdRows : []),
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
    externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
  };

  it('creates a new rules set when no external IDs match', async () => {
    const result = await service.upsert(baseData);

    expect(result).toEqual({ rulesSet: fakeRulesSet, created: true });
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
