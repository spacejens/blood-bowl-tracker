import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';
import { PaidAdvancementSlotsService } from './paid-advancement-slots.service';
import { PlayerAdvancementSyncPlannerService } from './player-advancement-sync-planner.service';
import { PlayerSkillsService } from './player-skills.service';

/**
 * PlayerSkillsService over a mocked db. Its sync planner chain is passed real:
 * PlayerAdvancementSyncPlannerService and the characteristic planner it
 * depends on are pure decision services (CLAUDE.md, Testing services).
 * PaidAdvancementSlotsService writes to the db, so it is mocked; a test that
 * asserts on it passes its own.
 */
export async function makeService(
  db: MockDbResult,
  paidSlots: MockProxy<PaidAdvancementSlotsService> = mock<PaidAdvancementSlotsService>(),
): Promise<PlayerSkillsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerSkillsService,
      PlayerAdvancementSyncPlannerService,
      CharacteristicAdvancementPlannerService,
      { provide: PaidAdvancementSlotsService, useValue: paidSlots },
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(PlayerSkillsService);
}
