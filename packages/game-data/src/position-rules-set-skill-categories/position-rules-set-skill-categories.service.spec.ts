import type { PositionRulesSetSkillCategoriesEntry } from '@blood-bowl-tracker/api-contract';
import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PositionSkillCategoryValidationError } from '../shared/position-skill-category-validation-error';
import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PositionRulesSetSkillCategoriesService } from './position-rules-set-skill-categories.service';

async function makeService(
  db: MockDbResult,
): Promise<PositionRulesSetSkillCategoriesService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionRulesSetSkillCategoriesService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(PositionRulesSetSkillCategoriesService);
}

/** Position 1 has characteristics under rules set 2, as row 50. */
const anchor = { id: 50, positionId: 1, rulesSetId: 2 };

type Categories = PositionRulesSetSkillCategoriesEntry['primary'];

function entry(
  primary: Categories,
  secondary: Categories,
): PositionRulesSetSkillCategoriesEntry {
  return { positionId: 1, rulesSetId: 2, primary, secondary };
}

interface StoredOptions {
  id: number;
  skillCategory: string;
  access: 'primary' | 'secondary';
  removed?: boolean;
}

function stored({ id, skillCategory, access, removed = false }: StoredOptions) {
  return { id, positionRulesSetId: 50, skillCategory, access, removed };
}

describe('PositionRulesSetSkillCategoriesService', () => {
  describe('sync validation', () => {
    it('writes nothing for an empty batch', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ entries: [] });

      expect(result).toEqual({ positionRulesSetSkillCategoryIds: [] });
      expect(db.chains).toHaveLength(0);
    });

    it.each([
      ['trait as primary', entry(['trait'], [])],
      ['unique as secondary', entry(['general'], ['unique'])],
    ])('rejects %s before any query', async (_label, bad) => {
      const db = mockDb();
      const service = await makeService(db);

      await expect(service.sync({ entries: [bad] })).rejects.toThrow(
        PositionSkillCategoryValidationError,
      );
      expect(db.chains).toHaveLength(0);
    });

    it('names the offending category and pair', async () => {
      const service = await makeService(mockDb());

      await expect(
        service.sync({ entries: [entry(['trait'], [])] }),
      ).rejects.toThrow(
        'Position 1 under rules set 2 cannot take skill category trait: only general, agility, passing, strength, mutation and devious can be primary or secondary',
      );
    });

    it('rejects a category listed as both primary and secondary', async () => {
      const service = await makeService(mockDb());

      await expect(
        service.sync({ entries: [entry(['general'], ['general'])] }),
      ).rejects.toThrow(
        'Position 1 under rules set 2 lists skill category general more than once',
      );
    });

    it('rejects a category repeated within one list', async () => {
      const service = await makeService(mockDb());

      await expect(
        service.sync({ entries: [entry(['agility', 'agility'], [])] }),
      ).rejects.toThrow(PositionSkillCategoryValidationError);
    });

    it('rejects a batch naming the same pair twice', async () => {
      const service = await makeService(mockDb());

      await expect(
        service.sync({
          entries: [entry(['general'], []), entry(['strength'], [])],
        }),
      ).rejects.toThrow(
        'Position 1 under rules set 2 appears more than once in the same batch',
      );
    });

    it('rejects a pair with no characteristics recorded', async () => {
      const service = await makeService(mockDb([]));

      await expect(
        service.sync({ entries: [entry(['general'], [])] }),
      ).rejects.toThrow(
        'Position 1 has no characteristics recorded under rules set 2, so it cannot carry skill categories there',
      );
    });
  });

  describe('sync writes', () => {
    it('scopes the anchor query to the batch positions and rules sets', async () => {
      const db = mockDb(
        [anchor],
        [stored({ id: 70, skillCategory: 'general', access: 'primary' })],
      );
      const service = await makeService(db);

      await service.sync({ entries: [entry(['general'], [])] });

      expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        2, 1,
      ]);
    });

    it('inserts every new category and returns ids in entry order, primary first', async () => {
      const db = mockDb(
        [anchor],
        [],
        [
          { id: 72, positionRulesSetId: 50, skillCategory: 'strength' },
          { id: 70, positionRulesSetId: 50, skillCategory: 'general' },
          { id: 71, positionRulesSetId: 50, skillCategory: 'agility' },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [entry(['general'], ['agility', 'strength'])],
      });

      expect(result).toEqual({
        positionRulesSetSkillCategoryIds: [70, 71, 72],
      });
      expect(firstCallArg(db.chains[2].values)).toEqual([
        { positionRulesSetId: 50, skillCategory: 'general', access: 'primary' },
        {
          positionRulesSetId: 50,
          skillCategory: 'agility',
          access: 'secondary',
        },
        {
          positionRulesSetId: 50,
          skillCategory: 'strength',
          access: 'secondary',
        },
      ]);
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('writes nothing for an unchanged set', async () => {
      const db = mockDb(
        [anchor],
        [
          stored({ id: 70, skillCategory: 'general', access: 'primary' }),
          stored({ id: 71, skillCategory: 'agility', access: 'secondary' }),
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [entry(['general'], ['agility'])],
      });

      expect(result).toEqual({ positionRulesSetSkillCategoryIds: [70, 71] });
      expect(db.chains).toHaveLength(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('moves a category between primary and secondary in place', async () => {
      const db = mockDb(
        [anchor],
        [stored({ id: 71, skillCategory: 'agility', access: 'secondary' })],
        [],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry(['agility'], [])] });

      expect(result).toEqual({ positionRulesSetSkillCategoryIds: [71] });
      expect(firstCallArg(db.chains[2].set)).toEqual({
        access: 'primary',
        removed: false,
      });
    });

    it('flags a category the set no longer lists as removed', async () => {
      const db = mockDb(
        [anchor],
        [
          stored({ id: 70, skillCategory: 'general', access: 'primary' }),
          stored({ id: 72, skillCategory: 'strength', access: 'secondary' }),
        ],
        [],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry(['general'], [])] });

      expect(result).toEqual({ positionRulesSetSkillCategoryIds: [70] });
      expect(firstCallArg(db.chains[2].set)).toEqual({
        access: 'secondary',
        removed: true,
      });
    });

    it('revives a removed category listed again', async () => {
      const db = mockDb(
        [anchor],
        [
          stored({
            id: 72,
            skillCategory: 'strength',
            access: 'secondary',
            removed: true,
          }),
        ],
        [],
      );
      const service = await makeService(db);

      await service.sync({ entries: [entry([], ['strength'])] });

      expect(firstCallArg(db.chains[2].set)).toEqual({
        access: 'secondary',
        removed: false,
      });
    });

    it('leaves an already removed category alone when it stays unlisted', async () => {
      const db = mockDb(
        [anchor],
        [
          stored({
            id: 72,
            skillCategory: 'strength',
            access: 'secondary',
            removed: true,
          }),
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry([], [])] });

      expect(result).toEqual({ positionRulesSetSkillCategoryIds: [] });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('flags every category of a pair synced with empty lists', async () => {
      const db = mockDb(
        [anchor],
        [
          stored({ id: 70, skillCategory: 'general', access: 'primary' }),
          stored({ id: 71, skillCategory: 'agility', access: 'secondary' }),
        ],
        [],
        [],
      );
      const service = await makeService(db);

      await service.sync({ entries: [entry([], [])] });

      expect(firstCallArg(db.chains[2].set)).toEqual({
        access: 'primary',
        removed: true,
      });
      expect(firstCallArg(db.chains[3].set)).toEqual({
        access: 'secondary',
        removed: true,
      });
    });

    it('throws when the insert returns no row for a new category', async () => {
      const db = mockDb([anchor], [], []);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [entry(['general'], [])] }),
      ).rejects.toThrow('did not return a row for key 50|general');
    });
  });
});
