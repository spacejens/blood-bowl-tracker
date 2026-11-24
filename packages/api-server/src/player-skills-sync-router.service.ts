import type {
  SyncPlayerSkills,
  SyncPlayerSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import {
  CuratedAdvancementOrderService,
  PlayerSkillsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/**
 * Picks which game-data service writes one `playerSkills.sync` batch. A
 * batch flagged `checkOrderAgainstSpend` goes through
 * CuratedAdvancementOrderService, which refuses a curated advancement order
 * that does not fit what is known about the player; any other batch goes
 * straight to PlayerSkillsService. Either service's refusal propagates to
 * the route, whose `runSync` maps it.
 */
@Injectable()
export class PlayerSkillsSyncRouterService {
  constructor(
    private readonly playerSkills: PlayerSkillsService,
    private readonly curatedAdvancementOrder: CuratedAdvancementOrderService,
  ) {}

  sync(input: SyncPlayerSkills): Promise<SyncPlayerSkillsResult> {
    return input.checkOrderAgainstSpend === true
      ? this.curatedAdvancementOrder.sync(input)
      : this.playerSkills.sync(input);
  }
}
