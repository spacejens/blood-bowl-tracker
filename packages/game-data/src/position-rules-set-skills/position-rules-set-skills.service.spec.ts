import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SkillValidationError } from '../shared/skill-validation-error';
import { PositionRulesSetSkillsService } from './position-rules-set-skills.service';

async function makeService(
  db: MockDbResult,
): Promise<PositionRulesSetSkillsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionRulesSetSkillsService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(PositionRulesSetSkillsService);
}

/** Position 3 has characteristics recorded under rules set 4, as row 21. */
const positionRulesSetRow = { id: 21, positionId: 3, rulesSetId: 4 };
/** Rules set 4 has skill 7. */
const skillRulesSetRow = { skillId: 7, rulesSetId: 4 };

const entry = {
  positionId: 3,
  rulesSetId: 4,
  skillId: 7,
};

describe('PositionRulesSetSkillsService', () => {
  describe('sync', () => {
    it('returns no ids and issues no query for an empty entries list', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ entries: [] });

      expect(result).toEqual({ positionRulesSetSkillIds: [] });
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("inserts a starting skill against the position's own association row", async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow],
        [],
        [{ id: 51, positionRulesSetId: 21, skillId: 7 }],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry] });

      expect(result).toEqual({ positionRulesSetSkillIds: [51] });
      expect(firstCallArg(db.chains[3].values)).toEqual([
        { positionRulesSetId: 21, skillId: 7 },
      ]);
      expect(db.transaction).toHaveBeenCalled();
    });

    it('returns the existing id without writing when the entry already exists', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow],
        [{ id: 51, positionRulesSetId: 21, skillId: 7 }],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry] });

      expect(result).toEqual({ positionRulesSetSkillIds: [51] });
      // Only the two precondition selects and the existing-rows select were
      // issued — no insert, and no transaction, since nothing needs writing.
      expect(db.chains).toHaveLength(3);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a skill the rules set does not have', async () => {
      // Query 1 finds no skill_rules_sets row for skill 7 under rules set 4.
      const db = mockDb([positionRulesSetRow], []);
      const service = await makeService(db);

      await expect(service.sync({ entries: [entry] })).rejects.toBeInstanceOf(
        SkillValidationError,
      );
      expect(db.chains).toHaveLength(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('names the skill and rules set when the rules set does not have it', async () => {
      const db = mockDb([positionRulesSetRow], []);
      const service = await makeService(db);

      await expect(service.sync({ entries: [entry] })).rejects.toThrow(
        /Skill 7 does not exist under rules set 4/,
      );
    });

    it('rejects a position with no characteristics recorded for the rules set', async () => {
      // Query 0 finds no position_rules_sets row for position 3 / rules set 4.
      const db = mockDb([], [skillRulesSetRow]);
      const service = await makeService(db);

      await expect(service.sync({ entries: [entry] })).rejects.toBeInstanceOf(
        SkillValidationError,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('names the position and rules set when no characteristics row exists', async () => {
      const db = mockDb([], [skillRulesSetRow]);
      const service = await makeService(db);

      await expect(service.sync({ entries: [entry] })).rejects.toThrow(
        /Position 3 has no characteristics recorded under rules set 4/,
      );
    });

    it('rejects a batch naming the same position, rules set and skill twice', async () => {
      const db = mockDb([positionRulesSetRow], [skillRulesSetRow]);
      const service = await makeService(db);

      await expect(
        service.sync({
          entries: [entry, entry],
        }),
      ).rejects.toBeInstanceOf(SkillValidationError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('returns ids in the same order as the input entries, not grouped by existing/new', async () => {
      // entryA and entryC already exist; entryB is new. Interleaving them
      // guards against the result being built as [...existing, ...inserted].
      const entryA = { positionId: 3, rulesSetId: 4, skillId: 7 };
      const entryB = { positionId: 5, rulesSetId: 4, skillId: 8 };
      const entryC = { positionId: 3, rulesSetId: 4, skillId: 9 };
      const db = mockDb(
        [positionRulesSetRow, { id: 22, positionId: 5, rulesSetId: 4 }],
        [
          skillRulesSetRow,
          { skillId: 8, rulesSetId: 4 },
          { skillId: 9, rulesSetId: 4 },
        ],
        [
          { id: 51, positionRulesSetId: 21, skillId: 7 },
          { id: 53, positionRulesSetId: 21, skillId: 9 },
        ],
        [{ id: 52, positionRulesSetId: 22, skillId: 8 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [entryA, entryB, entryC],
      });

      expect(result).toEqual({ positionRulesSetSkillIds: [51, 52, 53] });
    });

    it('matches inserted ids to their entries by natural key, not by RETURNING row order', async () => {
      // Both entries are new (no existing rows), so both go through the
      // insert path. Postgres does not guarantee INSERT ... RETURNING
      // preserves the input `values()` order, so the mock returns the two
      // inserted rows in the *reverse* of the order they were supplied in
      // `toInsert` — entryY's row first, then entryX's. If `sync` matched
      // by array position instead of by natural key, this would silently
      // swap the two ids in the result.
      const entryX = { positionId: 3, rulesSetId: 4, skillId: 7 };
      const entryY = { positionId: 5, rulesSetId: 4, skillId: 8 };
      const db = mockDb(
        [positionRulesSetRow, { id: 22, positionId: 5, rulesSetId: 4 }],
        [skillRulesSetRow, { skillId: 8, rulesSetId: 4 }],
        [],
        [
          { id: 102, positionRulesSetId: 22, skillId: 8 },
          { id: 101, positionRulesSetId: 21, skillId: 7 },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entryX, entryY] });

      expect(result).toEqual({ positionRulesSetSkillIds: [101, 102] });
    });

    it('throws when the RETURNING result omits a row for one of the inserted keys', async () => {
      // Both entries are new, so both go through the insert path. The mock
      // returns a row only for entryY's key (22|8) and omits entryX's key
      // (21|7) entirely — simulating an insert that silently dropped a row.
      // This should never happen (every `toInsert` row was just inserted in
      // the same statement), but the defensive check should still surface it
      // as a clear internal-invariant error rather than an undefined id.
      const entryX = { positionId: 3, rulesSetId: 4, skillId: 7 };
      const entryY = { positionId: 5, rulesSetId: 4, skillId: 8 };
      const db = mockDb(
        [positionRulesSetRow, { id: 22, positionId: 5, rulesSetId: 4 }],
        [skillRulesSetRow, { skillId: 8, rulesSetId: 4 }],
        [],
        [{ id: 102, positionRulesSetId: 22, skillId: 8 }],
      );
      const service = await makeService(db);

      await expect(service.sync({ entries: [entryX, entryY] })).rejects.toThrow(
        'Insert into position_rules_set_skills did not return a row for key 21|7',
      );
    });

    it('looks both preconditions up by the rules sets the batch names', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow],
        [],
        [{ id: 51, positionRulesSetId: 21, skillId: 7 }],
      );
      const service = await makeService(db);

      await service.sync({ entries: [entry] });

      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        4,
      ]);
      expect(extractFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        4,
      ]);
    });
  });

  describe('listByPosition', () => {
    it("returns the position's starting skills with their rules set and skill names", async () => {
      const db = mockDb([
        {
          rulesSetId: 4,
          rulesSetName: 'BB2020',
          skillId: 7,
          skillName: 'Block',
        },
      ]);
      const service = await makeService(db);

      await expect(service.listByPosition(3)).resolves.toEqual([
        {
          rulesSetId: 4,
          rulesSetName: 'BB2020',
          skillId: 7,
          skillName: 'Block',
        },
      ]);
      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(3);
    });

    it('returns an empty list for a position with no starting skills', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(service.listByPosition(3)).resolves.toEqual([]);
    });
  });
});
