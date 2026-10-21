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
import { SkillRulesSetsService } from './skill-rules-sets.service';

async function makeService(db: MockDbResult): Promise<SkillRulesSetsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SkillRulesSetsService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(SkillRulesSetsService);
}

const blockInBb2020 = {
  skillId: 7,
  rulesSetId: 4,
  category: 'general',
  isElite: false,
} as const;

describe('SkillRulesSetsService', () => {
  describe('sync', () => {
    it('returns no ids and issues no query for an empty entries list', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ entries: [] });

      expect(result).toEqual({ skillRulesSetIds: [] });
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('inserts a row for a skill the rules set does not have yet', async () => {
      // Query 0: the skill exists. Query 1: the rules set exists. Query 2:
      // the existing-rows lookup (nothing there). Query 3: the insert.
      const db = mockDb([{ id: 7 }], [{ id: 4 }], [], [{ id: 31 }]);
      const service = await makeService(db);

      const result = await service.sync({ entries: [blockInBb2020] });

      expect(result).toEqual({ skillRulesSetIds: [31] });
      expect(firstCallArg(db.chains[3].values)).toEqual([
        { skillId: 7, rulesSetId: 4, category: 'general', isElite: false },
      ]);
      expect(db.transaction).toHaveBeenCalled();
    });

    it("rewrites an existing pair's category in place rather than duplicating it", async () => {
      // Queries 0-1: both references exist. Query 2: the pair already
      // exists. Query 3: the update.
      const db = mockDb(
        [{ id: 7 }],
        [{ id: 4 }],
        [{ id: 31, skillId: 7, rulesSetId: 4 }],
        [{ id: 31 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...blockInBb2020, category: 'devious' }],
      });

      expect(result).toEqual({ skillRulesSetIds: [31] });
      expect(firstCallArg(db.chains[3].set)).toEqual({
        category: 'devious',
        isElite: false,
      });
    });

    it('writes isElite on an inserted row', async () => {
      const db = mockDb([{ id: 7 }], [{ id: 4 }], [], [{ id: 31 }]);
      const service = await makeService(db);

      await service.sync({ entries: [{ ...blockInBb2020, isElite: true }] });

      expect(firstCallArg(db.chains[3].values)).toEqual([
        { skillId: 7, rulesSetId: 4, category: 'general', isElite: true },
      ]);
    });

    it("rewrites an existing pair's isElite in place", async () => {
      const db = mockDb(
        [{ id: 7 }],
        [{ id: 4 }],
        [{ id: 31, skillId: 7, rulesSetId: 4 }],
        [{ id: 31 }],
      );
      const service = await makeService(db);

      await service.sync({ entries: [{ ...blockInBb2020, isElite: true }] });

      expect(firstCallArg(db.chains[3].set)).toEqual({
        category: 'general',
        isElite: true,
      });
    });

    it('rejects a batch naming the same skill and rules set twice, before any query', async () => {
      const db = mockDb();
      const service = await makeService(db);

      await expect(
        service.sync({
          entries: [blockInBb2020, { ...blockInBb2020, category: 'trait' }],
        }),
      ).rejects.toBeInstanceOf(SkillValidationError);
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('names the offending pair in the duplicate rejection', async () => {
      const db = mockDb();
      const service = await makeService(db);

      await expect(
        service.sync({
          entries: [blockInBb2020, { ...blockInBb2020, category: 'trait' }],
        }),
      ).rejects.toThrow(/Skill 7 under rules set 4/);
    });

    it('rejects an entry naming a skill that does not exist, writing nothing', async () => {
      const db = mockDb([], [{ id: 4 }]);
      const service = await makeService(db);

      const promise = service.sync({ entries: [blockInBb2020] });

      await expect(promise).rejects.toBeInstanceOf(SkillValidationError);
      await expect(promise).rejects.toThrow(
        'Skill 7 does not exist, so it cannot be categorised under rules set 4',
      );
      expect(db.chains).toHaveLength(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects an entry naming a rules set that does not exist, writing nothing', async () => {
      const db = mockDb([{ id: 7 }], []);
      const service = await makeService(db);

      const promise = service.sync({ entries: [blockInBb2020] });

      await expect(promise).rejects.toBeInstanceOf(SkillValidationError);
      await expect(promise).rejects.toThrow(
        'Rules set 4 does not exist, so skill 7 cannot be categorised under it',
      );
      expect(db.chains).toHaveLength(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('validates the whole batch before any write, even when the bad entry is last', async () => {
      // Skill 8 is missing; the first entry is fine. Only the two reference
      // lookups run, never the existing-rows lookup or a write.
      const db = mockDb([{ id: 7 }], [{ id: 4 }]);
      const service = await makeService(db);

      await expect(
        service.sync({
          entries: [
            blockInBb2020,
            { skillId: 8, rulesSetId: 4, category: 'agility', isElite: false },
          ],
        }),
      ).rejects.toThrow(/Skill 8 does not exist/);
      expect(db.chains).toHaveLength(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('looks the batch references and existing rows up by the ids the batch names', async () => {
      const db = mockDb(
        [{ id: 7 }, { id: 8 }],
        [{ id: 4 }, { id: 5 }],
        [],
        [{ id: 31 }, { id: 32 }],
      );
      const service = await makeService(db);

      await service.sync({
        entries: [
          blockInBb2020,
          { skillId: 8, rulesSetId: 5, category: 'agility', isElite: false },
        ],
      });

      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        7, 8,
      ]);
      expect(extractFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        4, 5,
      ]);
      expect(extractFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        4, 5,
      ]);
    });
  });

  describe('listBySkill', () => {
    it("returns each rules set's category for the skill", async () => {
      const db = mockDb([
        { rulesSetId: 4, rulesSetName: 'BB2020', category: 'general' },
      ]);
      const service = await makeService(db);

      await expect(service.listBySkill(7)).resolves.toEqual([
        { rulesSetId: 4, rulesSetName: 'BB2020', category: 'general' },
      ]);
      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(7);
    });

    it('returns an empty list for a skill no rules set has', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(service.listBySkill(7)).resolves.toEqual([]);
    });

    it('returns isElite alongside the category', async () => {
      const db = mockDb([
        {
          rulesSetId: 9,
          rulesSetName: 'BB2025',
          category: 'general',
          isElite: true,
        },
      ]);
      const service = await makeService(db);

      await expect(service.listBySkill(7)).resolves.toEqual([
        {
          rulesSetId: 9,
          rulesSetName: 'BB2025',
          category: 'general',
          isElite: true,
        },
      ]);
    });
  });

  describe('listByRulesSet', () => {
    it("returns each skill's category for the rules set", async () => {
      const db = mockDb([
        { skillId: 7, skillName: 'Block', category: 'general' },
      ]);
      const service = await makeService(db);

      await expect(service.listByRulesSet(4)).resolves.toEqual([
        { skillId: 7, skillName: 'Block', category: 'general' },
      ]);
      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(4);
    });

    it('returns an empty list for a rules set with no skills recorded', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await expect(service.listByRulesSet(4)).resolves.toEqual([]);
    });

    it('returns isElite alongside the category', async () => {
      const db = mockDb([
        { skillId: 7, skillName: 'Block', category: 'general', isElite: true },
      ]);
      const service = await makeService(db);

      await expect(service.listByRulesSet(9)).resolves.toEqual([
        { skillId: 7, skillName: 'Block', category: 'general', isElite: true },
      ]);
    });
  });
});
