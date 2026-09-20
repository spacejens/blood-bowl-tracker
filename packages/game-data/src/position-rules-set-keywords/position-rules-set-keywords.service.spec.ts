import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { KeywordValidationError } from '../shared/keyword-validation-error';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PositionRulesSetKeywordsService } from './position-rules-set-keywords.service';

async function makeService(
  db: MockDbResult,
): Promise<PositionRulesSetKeywordsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionRulesSetKeywordsService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(PositionRulesSetKeywordsService);
}

/** Position 1 has characteristics recorded under rules set 2, as row 50. */
const positionRulesSetRow = { id: 50, positionId: 1, rulesSetId: 2 };

const entry = { positionId: 1, rulesSetId: 2, keywordId: 3 };

describe('PositionRulesSetKeywordsService', () => {
  describe('sync', () => {
    it('writes nothing for an empty batch', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ entries: [] });

      expect(result).toEqual({ positionRulesSetKeywordIds: [] });
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('inserts a keyword for a position that has characteristics', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [],
        [{ id: 90, positionRulesSetId: 50, keywordId: 3 }],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry] });

      expect(result).toEqual({ positionRulesSetKeywordIds: [90] });
      expect(firstCallArg(db.chains[2].values)).toEqual([
        { positionRulesSetId: 50, keywordId: 3 },
      ]);
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('scopes the anchor query to the batch positions, not every position under the rules set', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [],
        [{ id: 90, positionRulesSetId: 50, keywordId: 3 }],
      );
      const service = await makeService(db);

      await service.sync({ entries: [entry] });

      const anchorWhereCondition = firstCallArg(db.chains[0].where);
      expect(extractJoinColumns(anchorWhereCondition)).toEqual([
        'position_rules_sets.rules_set_id',
        'position_rules_sets.position_id',
      ]);
      expect(extractAllFilterValues(anchorWhereCondition)).toEqual([2, 1]);
    });

    it('returns the existing row id without writing again', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [{ id: 90, positionRulesSetId: 50, keywordId: 3 }],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry] });

      expect(result).toEqual({ positionRulesSetKeywordIds: [90] });
      expect(db.chains).toHaveLength(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('writes several keywords for one position in one batch', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [],
        [
          { id: 91, positionRulesSetId: 50, keywordId: 4 },
          { id: 90, positionRulesSetId: 50, keywordId: 3 },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [
          { positionId: 1, rulesSetId: 2, keywordId: 3 },
          { positionId: 1, rulesSetId: 2, keywordId: 4 },
        ],
      });

      expect(result).toEqual({ positionRulesSetKeywordIds: [90, 91] });
    });

    it('rejects a position with no characteristics recorded for the rules set', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(service.sync({ entries: [entry] })).rejects.toBeInstanceOf(
        KeywordValidationError,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects the same triple twice in one batch', async () => {
      const db = mockDb([positionRulesSetRow]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [entry, entry] }),
      ).rejects.toBeInstanceOf(KeywordValidationError);
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('listByPosition', () => {
    it('lists a position keywords with their rules set and kind', async () => {
      const db = mockDb([
        {
          rulesSetId: 2,
          rulesSetName: 'BB2025',
          keywordId: 3,
          keywordName: 'Goblin',
          kind: 'species',
        },
      ]);
      const service = await makeService(db);

      await expect(service.listByPosition(1)).resolves.toEqual([
        {
          rulesSetId: 2,
          rulesSetName: 'BB2025',
          keywordId: 3,
          keywordName: 'Goblin',
          kind: 'species',
        },
      ]);
    });

    it('returns an empty list for a position with no keywords', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(service.listByPosition(1)).resolves.toEqual([]);
    });
  });
});
