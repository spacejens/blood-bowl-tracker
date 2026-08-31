import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { firstCallArg } from '../shared/query-assertions.test-helpers';
import {
  PositionRulesSetFormatMismatchError,
  PositionRulesSetsService,
} from './position-rules-sets.service';

async function makeService(
  db: MockDbResult,
): Promise<PositionRulesSetsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [PositionRulesSetsService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(PositionRulesSetsService);
}

/** A modern rules set: Agility, Passing and Armour are all target numbers. */
const bb2020Formats = {
  id: 4,
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
};

/** An older rules set: no Passing characteristic at all. */
const crpFormats = {
  id: 5,
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'bare',
  passingFormat: 'absent',
  armourFormat: 'bare',
};

const bb2020Entry = {
  positionId: 3,
  rulesSetId: 4,
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

const crpEntry = {
  positionId: 3,
  rulesSetId: 5,
  move: 6,
  strength: 3,
  agility: 3,
  passing: null,
  armour: 8,
};

describe('PositionRulesSetsService', () => {
  describe('sync', () => {
    it('returns no ids and issues no query for an empty entries list', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ entries: [] });

      expect(result).toEqual({ positionRulesSetIds: [] });
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('inserts a row whose characteristics match the declared formats', async () => {
      // Query 0: the rules-set format lookup. Query 1: the existing-rows
      // lookup (nothing there). Query 2: the insert.
      const db = mockDb([bb2020Formats], [], [{ id: 21 }]);
      const service = await makeService(db);

      const result = await service.sync({ entries: [bb2020Entry] });

      expect(result).toEqual({ positionRulesSetIds: [21] });
      expect(firstCallArg(db.chains[2].values)).toEqual([
        {
          positionId: 3,
          rulesSetId: 4,
          move: 6,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
      ]);
      expect(db.transaction).toHaveBeenCalled();
    });

    it('inserts a null passing for a rules set with no Passing characteristic', async () => {
      const db = mockDb([crpFormats], [], [{ id: 22 }]);
      const service = await makeService(db);

      const result = await service.sync({ entries: [crpEntry] });

      expect(result).toEqual({ positionRulesSetIds: [22] });
      expect(firstCallArg(db.chains[2].values)).toEqual([
        {
          positionId: 3,
          rulesSetId: 5,
          move: 6,
          strength: 3,
          agility: 3,
          passing: null,
          armour: 8,
        },
      ]);
    });

    it('rejects a characteristic the rules set declares absent', async () => {
      const db = mockDb([crpFormats]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [{ ...crpEntry, passing: 4 }] }),
      ).rejects.toBeInstanceOf(PositionRulesSetFormatMismatchError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('names the offending characteristic in the rejection', async () => {
      const db = mockDb([crpFormats]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [{ ...crpEntry, passing: 4 }] }),
      ).rejects.toThrow(/Passing/);
    });

    it('rejects a characteristic the rules set requires but the entry omits', async () => {
      const db = mockDb([bb2020Formats]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [{ ...bb2020Entry, passing: null }] }),
      ).rejects.toBeInstanceOf(PositionRulesSetFormatMismatchError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects an entry naming a rules set that does not exist', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [bb2020Entry] }),
      ).rejects.toBeInstanceOf(PositionRulesSetFormatMismatchError);
    });

    it('updates the existing row for a re-synced pair instead of duplicating it', async () => {
      // Query 0: formats. Query 1: the existing-rows lookup finds the pair.
      // Query 2: the UPDATE — and nothing else, which is what proves no
      // second row was inserted for the same pair.
      const db = mockDb(
        [bb2020Formats],
        [{ id: 21, positionId: 3, rulesSetId: 4 }],
        [{ id: 21 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...bb2020Entry, move: 7 }],
      });

      expect(result).toEqual({ positionRulesSetIds: [21] });
      expect(db.chains).toHaveLength(3);
      expect(firstCallArg(db.chains[2].set)).toEqual({
        move: 7,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      });
    });
  });
});
