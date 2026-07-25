import type { Db } from '@blood-bowl-tracker/db';
import { DB, rulesSets } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  RulesSetsService,
  RulesSetUpsertConflictError,
} from './rules-sets.service';

const fakeRulesSet = {
  id: 1,
  name: 'BB2020',
  createdAt: new Date('2026-01-01'),
};

describe('RulesSetsService', () => {
  let service: RulesSetsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [RulesSetsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(RulesSetsService);
    return { db, chains };
  }

  const baseData = {
    name: 'BB2020',
    externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
  };

  it('creates a new rules set when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert
    // returns the row; query 2: the one external ID is new and gets
    // inserted.
    const { db, chains } = await build([], [fakeRulesSet]);

    const result = await service.upsert(baseData);

    expect(result).toEqual({ rulesSet: fakeRulesSet, created: true });
    expect(chains).toHaveLength(3);
    expect(db.insert).toHaveBeenCalledWith(rulesSets);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates the matching rules set when exactly one external ID matches', async () => {
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'BB2020' }],
      [fakeRulesSet],
    );

    const result = await service.upsert(baseData);

    expect(result.created).toBe(false);
    expect(chains).toHaveLength(2);
    expect(db.update).toHaveBeenCalledWith(rulesSets);
  });

  it('throws RulesSetUpsertConflictError when external IDs match different rules sets', async () => {
    const { db, chains } = await build([
      { ownerId: 1, externalSystemId: 1, externalId: 'BB2020' },
      { ownerId: 2, externalSystemId: 2, externalId: 'BB2020' },
    ]);

    await expect(service.upsert(baseData)).rejects.toThrow(
      RulesSetUpsertConflictError,
    );
    expect(chains).toHaveLength(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { chains } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(chains[0].from).toHaveBeenCalledTimes(1);
    });
  });
});
