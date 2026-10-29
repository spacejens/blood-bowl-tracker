import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetSkillCategoriesService } from '@blood-bowl-tracker/game-data';
import { UpsertRecorderService } from '@blood-bowl-tracker/import-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpOfficialBatchSyncService } from './tp-official-batch-sync.service';
import { TpOfficialSkillCategoriesSyncService } from './tp-official-skill-categories-sync.service';
import {
  officialTeamsContext,
  positionSlot,
  RULES_SET_ID,
} from './tp-official-teams.test-helpers';

describe('TpOfficialSkillCategoriesSyncService', () => {
  let service: TpOfficialSkillCategoriesSyncService;
  let skillCategories: MockProxy<PositionRulesSetSkillCategoriesService>;
  let errors: ImportError[];

  beforeEach(async () => {
    skillCategories = mock<PositionRulesSetSkillCategoriesService>();
    skillCategories.sync.mockResolvedValue({
      positionRulesSetSkillCategoryIds: [1],
    });
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialSkillCategoriesSyncService,
        // Constructor-free and I/O-free, passed real exactly as in
        // tp-official-keywords-sync.service.spec.ts.
        TpOfficialBatchSyncService,
        UpsertRecorderService,
        {
          provide: PositionRulesSetSkillCategoriesService,
          useValue: skillCategories,
        },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialSkillCategoriesSyncService);
  });

  it("writes every position's complete set under the rules set in one call", async () => {
    const imported = await service.syncSkillCategories({
      slots: [
        positionSlot({
          skillCategories: { primary: ['general'], secondary: ['agility'] },
        }),
        positionSlot({
          positionId: 12,
          name: 'Griff',
          skillCategories: { primary: [], secondary: [] },
        }),
      ],
      context: officialTeamsContext(),
      errors,
    });

    expect(skillCategories.sync).toHaveBeenCalledTimes(1);
    expect(skillCategories.sync).toHaveBeenCalledWith({
      entries: [
        {
          positionId: 9,
          rulesSetId: RULES_SET_ID,
          primary: ['general'],
          secondary: ['agility'],
        },
        {
          positionId: 12,
          rulesSetId: RULES_SET_ID,
          primary: [],
          secondary: [],
        },
      ],
    });
    expect(imported).toBe(2);
    expect(errors).toEqual([]);
  });

  it('retries per position and reports the one that fails by name', async () => {
    skillCategories.sync
      .mockRejectedValueOnce(new Error('batch rejected'))
      .mockRejectedValueOnce(new Error('no characteristics'))
      .mockResolvedValue({ positionRulesSetSkillCategoryIds: [1] });

    const imported = await service.syncSkillCategories({
      slots: [
        positionSlot(),
        positionSlot({ positionId: 12, name: 'Thrower' }),
      ],
      context: officialTeamsContext(),
      errors,
    });

    expect(imported).toBe(1);
    expect(errors).toEqual([
      {
        item: { positionId: 9, rulesSet: 'BB2020' },
        message:
          'Failed to write the skill categories of position "Blitzer" (BB2020): no characteristics',
      },
    ]);
  });

  it('reports a position with corrupt categories and skips it, writing the rest', async () => {
    const imported = await service.syncSkillCategories({
      slots: [
        positionSlot({
          skillCategoriesError: 'Human / Blitzer: general is both',
        }),
        positionSlot({
          positionId: 12,
          name: 'Thrower',
          skillCategories: { primary: ['passing'], secondary: [] },
        }),
      ],
      context: officialTeamsContext(),
      errors,
    });

    expect(skillCategories.sync).toHaveBeenCalledTimes(1);
    expect(skillCategories.sync).toHaveBeenCalledWith({
      entries: [
        {
          positionId: 12,
          rulesSetId: RULES_SET_ID,
          primary: ['passing'],
          secondary: [],
        },
      ],
    });
    expect(imported).toBe(1);
    expect(errors).toEqual([
      {
        item: { positionId: 9, rulesSet: 'BB2020' },
        message:
          'Skipping the skill categories of position "Blitzer" (BB2020): Human / Blitzer: general is both',
      },
    ]);
  });

  it('makes no call when there are no positions', async () => {
    const imported = await service.syncSkillCategories({
      slots: [],
      context: officialTeamsContext(),
      errors,
    });

    expect(imported).toBe(0);
    expect(skillCategories.sync).not.toHaveBeenCalled();
  });
});
