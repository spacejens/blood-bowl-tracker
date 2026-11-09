import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { RulesSetsQueriesService } from './rules-sets-queries.service';

describe('RulesSetsQueriesService', () => {
  let service: RulesSetsQueriesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [RulesSetsQueriesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(RulesSetsQueriesService);
    return { db, chains };
  }

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { chains } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(chains[0].from).toHaveBeenCalledTimes(1);
    });
  });
});
