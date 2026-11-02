import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';

import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';
import { PlayerAdvancementSyncPlannerService } from './player-advancement-sync-planner.service';
import { PlayerSkillsService } from './player-skills.service';

/**
 * PlayerSkillsService over a mocked db. Its sync planner chain is passed real:
 * PlayerAdvancementSyncPlannerService and the characteristic planner it
 * depends on are pure decision services (CLAUDE.md, Testing services).
 */
export async function makeService(
  db: MockDbResult,
): Promise<PlayerSkillsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerSkillsService,
      PlayerAdvancementSyncPlannerService,
      CharacteristicAdvancementPlannerService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(PlayerSkillsService);
}
