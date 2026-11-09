import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { TeamsService } from './teams.service';

describe('TeamsService lookups', () => {
  let service: TeamsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [TeamsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(TeamsService);
    return { db, chains };
  }

  describe('findTeamEraId', () => {
    it('returns the team era id the query resolves to', async () => {
      await build([{ id: 31 }]);
      await expect(service.findTeamEraId(7, 40)).resolves.toBe(31);
    });

    it('returns undefined when the team is not linked to the era', async () => {
      await build([]);
      await expect(service.findTeamEraId(7, 40)).resolves.toBeUndefined();
    });

    it('filters by both the team and the era', async () => {
      const { chains } = await build([]);

      await service.findTeamEraId(7, 40);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        7, 40,
      ]);
    });
  });
});
