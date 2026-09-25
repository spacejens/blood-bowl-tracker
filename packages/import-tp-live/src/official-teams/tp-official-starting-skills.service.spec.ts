import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { Skill } from '@blood-bowl-tracker/db';
import type { SkillCategoryByRulesSet } from '@blood-bowl-tracker/game-data';
import {
  PositionRulesSetSkillsService,
  SkillRulesSetsService,
  SkillsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpStartingSkillRef } from './tp-official-skill-refs.service';
import { TpOfficialStartingSkillsService } from './tp-official-starting-skills.service';
import {
  NAME_SYSTEM_ID,
  officialTeamsContext,
  RULES_SET_ID,
  TP_SYSTEM_ID,
} from './tp-official-teams.test-helpers';

const BLOCK: TpStartingSkillRef = {
  name: 'Block',
  isElite: false,
  externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: '41' }],
};

function curated(rulesSetId: number, isElite: boolean) {
  return mock<SkillCategoryByRulesSet>({ rulesSetId, isElite });
}

describe('TpOfficialStartingSkillsService', () => {
  let service: TpOfficialStartingSkillsService;
  let skills: MockProxy<SkillsService>;
  let skillRulesSets: MockProxy<SkillRulesSetsService>;
  let positionSkills: MockProxy<PositionRulesSetSkillsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    skills = mock<SkillsService>();
    skills.upsert.mockResolvedValue({
      skill: mock<Skill>({ id: 500 }),
      created: false,
    });
    skillRulesSets = mock<SkillRulesSetsService>();
    skillRulesSets.listBySkill.mockResolvedValue([
      curated(RULES_SET_ID, false),
    ]);
    positionSkills = mock<PositionRulesSetSkillsService>();
    positionSkills.sync.mockResolvedValue({ positionRulesSetSkillIds: [1] });
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialStartingSkillsService,
        TpNameExternalIdService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: SkillsService, useValue: skills },
        { provide: SkillRulesSetsService, useValue: skillRulesSets },
        { provide: PositionRulesSetSkillsService, useValue: positionSkills },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialStartingSkillsService);
  });

  const sync = (refsByPositionId: Map<number, TpStartingSkillRef[]>) =>
    service.syncStartingSkills({
      refsByPositionId,
      context: officialTeamsContext(),
      errors,
    });

  it('upserts a named skill with its Name and TP ids and writes it as a starting skill', async () => {
    const written = await sync(
      new Map([[9, [{ ...BLOCK, attributeValue: '+1' }]]]),
    );

    expect(skills.upsert).toHaveBeenCalledWith({
      name: 'Block',
      externalIds: [
        { externalSystemId: NAME_SYSTEM_ID, externalId: 'Block' },
        { externalSystemId: TP_SYSTEM_ID, externalId: '41' },
      ],
    });
    expect(skillRulesSets.listBySkill).toHaveBeenCalledWith(500);
    expect(positionSkills.sync).toHaveBeenCalledWith({
      entries: [
        {
          positionId: 9,
          rulesSetId: RULES_SET_ID,
          skillId: 500,
          attributeValue: '+1',
        },
      ],
    });
    expect(written).toBe(1);
    expect(errors).toEqual([]);
  });

  it('uses an already-resolved skill id without upserting by name', async () => {
    await sync(new Map([[9, [{ name: 'TP skill 41', skillId: 700 }]]]));

    expect(skills.upsert).not.toHaveBeenCalled();
    expect(positionSkills.sync).toHaveBeenCalledWith({
      entries: [{ positionId: 9, rulesSetId: RULES_SET_ID, skillId: 700 }],
    });
  });

  it('upserts and reads each skill once across positions, one write per position', async () => {
    const written = await sync(
      new Map([
        [9, [BLOCK]],
        [12, [BLOCK]],
      ]),
    );

    expect(skills.upsert).toHaveBeenCalledTimes(1);
    expect(skillRulesSets.listBySkill).toHaveBeenCalledTimes(1);
    expect(positionSkills.sync).toHaveBeenCalledTimes(2);
    expect(written).toBe(2);
  });

  it('reports a skill with no curated category for the rules set once, and leaves it out', async () => {
    skillRulesSets.listBySkill.mockResolvedValue([curated(99, false)]);

    const written = await sync(
      new Map([
        [9, [BLOCK]],
        [12, [BLOCK]],
      ]),
    );

    expect(positionSkills.sync).not.toHaveBeenCalled();
    expect(written).toBe(0);
    expect(errors).toEqual([
      {
        item: { skill: 'Block', rulesSet: 'BB2020' },
        message:
          'Skill "Block" has no curated category for rules set "BB2020", so it cannot be recorded as a starting skill there. Curate one in tools/import-manual (data/before-other-importers/skills.json5).',
      },
    ]);
  });

  it('reports an elite disagreement once but still records the skill', async () => {
    skillRulesSets.listBySkill.mockResolvedValue([curated(RULES_SET_ID, true)]);

    const written = await sync(new Map([[9, [BLOCK]]]));

    expect(written).toBe(1);
    expect(errors).toEqual([
      {
        item: { skill: 'Block', rulesSet: 'BB2020' },
        message:
          'Skill "Block" is curated as elite for rules set "BB2020", but the source data marks it as not elite. Correct the curated value in tools/import-manual (data/before-other-importers/skills.json5). The starting skill itself is still recorded -- only the elite marker disagrees.',
      },
    ]);
  });

  it('skips the elite cross-check when the source says nothing about eliteness', async () => {
    skillRulesSets.listBySkill.mockResolvedValue([curated(RULES_SET_ID, true)]);

    await sync(new Map([[9, [{ name: 'TP skill 41', skillId: 700 }]]]));

    expect(errors).toEqual([]);
  });

  it('merges two refs to one skill, keeping the one attribute value given', async () => {
    await sync(new Map([[9, [BLOCK, { ...BLOCK, attributeValue: '+1' }]]]));

    expect(positionSkills.sync).toHaveBeenCalledWith({
      entries: [
        {
          positionId: 9,
          rulesSetId: RULES_SET_ID,
          skillId: 500,
          attributeValue: '+1',
        },
      ],
    });
  });

  it('drops a skill listed with two conflicting attribute values', async () => {
    const written = await sync(
      new Map([
        [
          9,
          [
            { ...BLOCK, attributeValue: '+1' },
            { ...BLOCK, attributeValue: '+2' },
            { ...BLOCK, attributeValue: '+1' },
          ],
        ],
      ]),
    );

    expect(positionSkills.sync).not.toHaveBeenCalled();
    expect(written).toBe(0);
    expect(errors).toEqual([
      {
        item: { skill: 'Block', positionId: 9, rulesSetId: RULES_SET_ID },
        message:
          'Skill "Block" was listed with conflicting attribute values ("+1" and "+2") for position 9 under rules set "BB2020", so it is left out of that position\'s starting skills there.',
      },
    ]);
  });

  it('reports a failed skill upsert once and leaves the skill out', async () => {
    skills.upsert.mockRejectedValue(new Error('conflict'));

    const written = await sync(
      new Map([
        [9, [BLOCK]],
        [12, [BLOCK]],
      ]),
    );

    expect(skills.upsert).toHaveBeenCalledTimes(1);
    expect(written).toBe(0);
    expect(errors).toEqual([
      {
        item: { skill: 'Block' },
        message: 'Failed to upsert skill "Block": conflict',
      },
    ]);
  });

  it('reports a failed curated read without a second curation-gap error', async () => {
    skillRulesSets.listBySkill.mockRejectedValue(new Error('boom'));

    const written = await sync(new Map([[9, [BLOCK]]]));

    expect(written).toBe(0);
    expect(errors).toEqual([
      {
        item: { skill: 'Block' },
        message: 'Failed to read the curated categories of skill "Block": boom',
      },
    ]);
  });

  it("records a rejected position's write and still writes the others", async () => {
    positionSkills.sync
      .mockRejectedValueOnce(new Error('no characteristics row'))
      .mockResolvedValueOnce({ positionRulesSetSkillIds: [2] });

    const written = await sync(
      new Map([
        [9, [BLOCK]],
        [12, [BLOCK]],
      ]),
    );

    expect(written).toBe(1);
    expect(errors).toEqual([
      {
        item: { positionId: 9, rulesSet: 'BB2020' },
        message:
          'Failed to write 1 starting skill(s) of position 9 (BB2020): no characteristics row',
      },
    ]);
  });
});
