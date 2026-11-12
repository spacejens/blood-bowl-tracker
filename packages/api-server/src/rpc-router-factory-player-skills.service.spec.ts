import {
  CuratedAdvancementOrderError,
  SkillValidationError,
} from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService playerSkills router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('syncs player skills straight through to the service', async () => {
    harness.mocks.playerSkillsService.sync.mockResolvedValue({
      playerSkillIds: [51],
    });

    const result = await call(harness.router.playerSkills.sync, {
      entries: [{ playerId: 1, skillId: 7, source: 'starting' }],
    });

    expect(harness.mocks.playerSkillsService.sync).toHaveBeenCalledWith({
      entries: [{ playerId: 1, skillId: 7, source: 'starting' }],
    });
    expect(result).toEqual({ playerSkillIds: [51] });
  });

  it('sends a sync flagged checkOrderAgainstSpend to the curated order check', async () => {
    harness.mocks.curatedAdvancementOrder.sync.mockResolvedValue({
      playerSkillIds: [51],
    });
    const input = {
      entries: [
        {
          playerId: 1,
          skillId: 7,
          source: 'advancement' as const,
          advancementOrder: 1,
          orderConfirmed: true,
        },
      ],
      checkOrderAgainstSpend: true,
    };

    const result = await call(harness.router.playerSkills.sync, input);

    expect(harness.mocks.curatedAdvancementOrder.sync).toHaveBeenCalledWith(
      input,
    );
    expect(harness.mocks.playerSkillsService.sync).not.toHaveBeenCalled();
    expect(result).toEqual({ playerSkillIds: [51] });
  });

  it('reports a refused curated order as BAD_REQUEST', async () => {
    harness.mocks.curatedAdvancementOrder.sync.mockRejectedValue(
      new CuratedAdvancementOrderError('Player 1 lists no advancements'),
    );

    await expect(
      call(harness.router.playerSkills.sync, {
        entries: [],
        characteristicPlayerIds: [1],
        checkOrderAgainstSpend: true,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Player 1 lists no advancements',
    });
  });

  it('reports an entry naming a missing skill as BAD_REQUEST', async () => {
    harness.mocks.playerSkillsService.sync.mockRejectedValue(
      new SkillValidationError('Skill 7 does not exist'),
    );

    await expect(
      call(harness.router.playerSkills.sync, {
        entries: [{ playerId: 1, skillId: 7, source: 'chosen' }],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Skill 7 does not exist',
    });
  });

  it("lists one player's skills without the fields the contract does not carry", async () => {
    harness.mocks.playerSkillsService.listByPlayer.mockResolvedValue([
      {
        skillId: 7,
        skillName: 'Block',
        source: 'starting',
        attributeValue: null,
        advancementOrder: null,
        orderConfirmed: false,
        category: 'general',
        isElite: false,
        isFreeExtra: false,
      },
    ]);

    const result = await call(harness.router.playerSkills.list, {
      playerId: 1,
      rulesSetId: 3,
    });

    expect(harness.mocks.playerSkillsService.listByPlayer).toHaveBeenCalledWith(
      1,
      3,
    );
    expect(result).toEqual([
      {
        skillId: 7,
        source: 'starting',
        attributeValue: null,
        advancementOrder: null,
        isFreeExtra: false,
      },
    ]);
  });
});
