import { SkillValidationError } from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

const skill = {
  id: 7,
  name: 'Block',
  createdAt: new Date('2026-01-01'),
};

// The db row carries history-tracking columns the contract's SkillSchema
// does not; the mock must supply them to satisfy SkillsService's return
// type, but the expectations below only assert on what the contract carries.
const skillRow = {
  ...skill,
  updatedAt: new Date('2026-01-01'),
  historyVersion: 1,
  historyPeriod: '["2026-01-01 00:00:00+00",)',
};

describe('RpcRouterFactoryService skills routers', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('flattens a created skill and its created flag into the upsert response', async () => {
    harness.mocks.skillsService.upsert.mockResolvedValue({
      skill: skillRow,
      created: true,
    });

    const result = await call(harness.router.skills.upsert, {
      name: 'Block',
      externalIds: [{ externalSystemId: 1, externalId: '3' }],
    });

    expect(result).toEqual({ ...skill, created: true });
  });

  it('answers a resolve with what the service found', async () => {
    harness.mocks.skillsService.resolve.mockResolvedValue({
      found: true,
      id: 7,
    });

    await expect(
      call(harness.router.skills.resolve, {
        externalSystemId: 1,
        externalId: '3',
      }),
    ).resolves.toEqual({ found: true, id: 7 });
  });

  it('syncs skill rules sets straight through to the service', async () => {
    harness.mocks.skillRulesSetsService.sync.mockResolvedValue({
      skillRulesSetIds: [31],
    });

    const result = await call(harness.router.skillRulesSets.sync, {
      entries: [{ skillId: 7, rulesSetId: 4, category: 'general' }],
    });

    expect(result).toEqual({ skillRulesSetIds: [31] });
  });

  it('reports a duplicate skill rules-set pair as BAD_REQUEST', async () => {
    harness.mocks.skillRulesSetsService.sync.mockRejectedValue(
      new SkillValidationError('Skill 7 under rules set 4 appears twice'),
    );

    await expect(
      call(harness.router.skillRulesSets.sync, {
        entries: [{ skillId: 7, rulesSetId: 4, category: 'general' }],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Skill 7 under rules set 4 appears twice',
    });
  });

  it("lists one skill's categories without the fields the contract does not carry", async () => {
    harness.mocks.skillRulesSetsService.listBySkill.mockResolvedValue([
      { rulesSetId: 4, rulesSetName: 'BB2020', category: 'general' },
    ]);

    const result = await call(harness.router.skillRulesSets.list, {
      skillId: 7,
    });

    expect(
      harness.mocks.skillRulesSetsService.listBySkill,
    ).toHaveBeenCalledWith(7);
    expect(result).toEqual([{ rulesSetId: 4, category: 'general' }]);
  });

  it('syncs starting skills straight through to the service', async () => {
    harness.mocks.positionRulesSetSkillsService.sync.mockResolvedValue({
      positionRulesSetSkillIds: [51],
    });

    const result = await call(harness.router.positionRulesSetSkills.sync, {
      entries: [{ positionId: 3, rulesSetId: 4, skillId: 7 }],
    });

    expect(result).toEqual({ positionRulesSetSkillIds: [51] });
  });

  it('reports an unavailable starting skill as BAD_REQUEST', async () => {
    harness.mocks.positionRulesSetSkillsService.sync.mockRejectedValue(
      new SkillValidationError('Skill 7 does not exist under rules set 4'),
    );

    await expect(
      call(harness.router.positionRulesSetSkills.sync, {
        entries: [{ positionId: 3, rulesSetId: 4, skillId: 7 }],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Skill 7 does not exist under rules set 4',
    });
  });

  it("lists one position's starting skills without the names the contract does not carry", async () => {
    harness.mocks.positionRulesSetSkillsService.listByPosition.mockResolvedValue(
      [
        {
          rulesSetId: 4,
          rulesSetName: 'BB2020',
          skillId: 7,
          skillName: 'Block',
          isStarPlayerUniqueSkill: false,
        },
      ],
    );

    const result = await call(harness.router.positionRulesSetSkills.list, {
      positionId: 3,
    });

    expect(
      harness.mocks.positionRulesSetSkillsService.listByPosition,
    ).toHaveBeenCalledWith(3);
    expect(result).toEqual([
      { rulesSetId: 4, skillId: 7, isStarPlayerUniqueSkill: false },
    ]);
  });
});
