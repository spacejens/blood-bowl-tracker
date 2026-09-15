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
  isStarPlayerUniqueSkill: false,
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
        [{ id: 51 }],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry] });

      expect(result).toEqual({ positionRulesSetSkillIds: [51] });
      expect(firstCallArg(db.chains[3].values)).toEqual([
        { positionRulesSetId: 21, skillId: 7, isStarPlayerUniqueSkill: false },
      ]);
      expect(db.transaction).toHaveBeenCalled();
    });

    it('records a star player unique skill on the association row', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow],
        [],
        [{ id: 52 }],
      );
      const service = await makeService(db);

      await service.sync({
        entries: [{ ...entry, isStarPlayerUniqueSkill: true }],
      });

      expect(firstCallArg(db.chains[3].values)).toEqual([
        { positionRulesSetId: 21, skillId: 7, isStarPlayerUniqueSkill: true },
      ]);
    });

    it('updates an existing starting skill in place rather than duplicating it', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow],
        [{ id: 51, positionRulesSetId: 21, skillId: 7 }],
        [{ id: 51 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...entry, isStarPlayerUniqueSkill: true }],
      });

      expect(result).toEqual({ positionRulesSetSkillIds: [51] });
      expect(firstCallArg(db.chains[3].set)).toEqual({
        isStarPlayerUniqueSkill: true,
      });
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
          entries: [entry, { ...entry, isStarPlayerUniqueSkill: true }],
        }),
      ).rejects.toBeInstanceOf(SkillValidationError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a batch with two entries both flagged as the star player unique skill for the same position/rules set', async () => {
      const otherSkillRulesSetRow = { skillId: 8, rulesSetId: 4 };
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow, otherSkillRulesSetRow],
      );
      const service = await makeService(db);

      await expect(
        service.sync({
          entries: [
            { ...entry, isStarPlayerUniqueSkill: true },
            {
              ...entry,
              skillId: 8,
              isStarPlayerUniqueSkill: true,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(SkillValidationError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a new star player unique skill entry when a different skill already holds that flag for the same position/rules set', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow],
        [
          {
            id: 51,
            positionRulesSetId: 21,
            skillId: 9,
            isStarPlayerUniqueSkill: true,
          },
        ],
      );
      const service = await makeService(db);

      await expect(
        service.sync({
          entries: [{ ...entry, isStarPlayerUniqueSkill: true }],
        }),
      ).rejects.toBeInstanceOf(SkillValidationError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('allows an entry updating its own row to keep its star player unique skill flag', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow],
        [
          {
            id: 51,
            positionRulesSetId: 21,
            skillId: 7,
            isStarPlayerUniqueSkill: true,
          },
        ],
        [{ id: 51 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...entry, isStarPlayerUniqueSkill: true }],
      });

      expect(result).toEqual({ positionRulesSetSkillIds: [51] });
    });

    it('allows a batch that reassigns the star player unique skill from one skill to another', async () => {
      const otherSkillRulesSetRow = { skillId: 8, rulesSetId: 4 };
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow, otherSkillRulesSetRow],
        [
          {
            id: 51,
            positionRulesSetId: 21,
            skillId: 7,
            isStarPlayerUniqueSkill: true,
          },
          {
            id: 52,
            positionRulesSetId: 21,
            skillId: 8,
            isStarPlayerUniqueSkill: false,
          },
        ],
        [{ id: 51 }],
        [{ id: 52 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [
          { ...entry, skillId: 7, isStarPlayerUniqueSkill: false },
          { ...entry, skillId: 8, isStarPlayerUniqueSkill: true },
        ],
      });

      expect(result).toEqual({ positionRulesSetSkillIds: [51, 52] });
      // Update clearing skill A's flag (id 51) is issued before the update
      // setting skill B's flag (id 52), so the partial unique index is never
      // transiently violated within the transaction.
      expect(firstCallArg(db.chains[3].where)).toBeDefined();
      expect(firstCallArg(db.chains[3].set)).toEqual({
        isStarPlayerUniqueSkill: false,
      });
      expect(firstCallArg(db.chains[4].set)).toEqual({
        isStarPlayerUniqueSkill: true,
      });
      expect(db.transaction).toHaveBeenCalled();
    });

    it('rejects a batch reassigning the flag out of order in the request when a different, unrelated skill also claims it', async () => {
      const otherSkillRulesSetRow = { skillId: 8, rulesSetId: 4 };
      const thirdSkillRulesSetRow = { skillId: 9, rulesSetId: 4 };
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow, otherSkillRulesSetRow, thirdSkillRulesSetRow],
        [
          {
            id: 51,
            positionRulesSetId: 21,
            skillId: 7,
            isStarPlayerUniqueSkill: true,
          },
        ],
      );
      const service = await makeService(db);

      // Skill 7's flag is never cleared in this batch, so skill 9 claiming
      // the flag still conflicts with it.
      await expect(
        service.sync({
          entries: [{ ...entry, skillId: 9, isStarPlayerUniqueSkill: true }],
        }),
      ).rejects.toBeInstanceOf(SkillValidationError);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('looks both preconditions up by the rules sets the batch names', async () => {
      const db = mockDb(
        [positionRulesSetRow],
        [skillRulesSetRow],
        [],
        [{ id: 51 }],
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
          isStarPlayerUniqueSkill: false,
        },
      ]);
      const service = await makeService(db);

      await expect(service.listByPosition(3)).resolves.toEqual([
        {
          rulesSetId: 4,
          rulesSetName: 'BB2020',
          skillId: 7,
          skillName: 'Block',
          isStarPlayerUniqueSkill: false,
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
