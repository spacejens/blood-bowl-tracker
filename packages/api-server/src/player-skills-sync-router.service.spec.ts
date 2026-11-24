import {
  CuratedAdvancementOrderService,
  PlayerSkillsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerSkillsSyncRouterService } from './player-skills-sync-router.service';

const entries = [
  {
    playerId: 1,
    skillId: 7,
    source: 'advancement' as const,
    advancementOrder: 1,
    orderConfirmed: true,
  },
];

describe('PlayerSkillsSyncRouterService', () => {
  let service: PlayerSkillsSyncRouterService;
  let playerSkills: MockProxy<PlayerSkillsService>;
  let curatedAdvancementOrder: MockProxy<CuratedAdvancementOrderService>;

  beforeEach(async () => {
    playerSkills = mock<PlayerSkillsService>();
    curatedAdvancementOrder = mock<CuratedAdvancementOrderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerSkillsSyncRouterService,
        { provide: PlayerSkillsService, useValue: playerSkills },
        {
          provide: CuratedAdvancementOrderService,
          useValue: curatedAdvancementOrder,
        },
      ],
    }).compile();
    service = moduleRef.get(PlayerSkillsSyncRouterService);
  });

  it('sends an unflagged batch straight to PlayerSkillsService', async () => {
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [51] });

    await expect(service.sync({ entries })).resolves.toEqual({
      playerSkillIds: [51],
    });
    expect(playerSkills.sync).toHaveBeenCalledWith({ entries });
    expect(curatedAdvancementOrder.sync).not.toHaveBeenCalled();
  });

  it('sends a batch flagged checkOrderAgainstSpend: false straight through too', async () => {
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [51] });

    const input = { entries, checkOrderAgainstSpend: false };

    await expect(service.sync(input)).resolves.toEqual({
      playerSkillIds: [51],
    });
    expect(playerSkills.sync).toHaveBeenCalledWith(input);
    expect(curatedAdvancementOrder.sync).not.toHaveBeenCalled();
  });

  it('sends a batch flagged checkOrderAgainstSpend to the curated order check', async () => {
    curatedAdvancementOrder.sync.mockResolvedValue({ playerSkillIds: [51] });
    const input = { entries, checkOrderAgainstSpend: true };

    await expect(service.sync(input)).resolves.toEqual({
      playerSkillIds: [51],
    });
    expect(curatedAdvancementOrder.sync).toHaveBeenCalledWith(input);
    expect(playerSkills.sync).not.toHaveBeenCalled();
  });
});
