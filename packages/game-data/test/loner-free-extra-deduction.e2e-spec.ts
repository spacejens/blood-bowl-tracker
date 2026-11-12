import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, playerAdvancements } from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicAdvancementPlannerService } from '../src/player-skills/characteristic-advancement-planner.service';
import { PaidAdvancementSlotsService } from '../src/player-skills/paid-advancement-slots.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { AdvancementKindCandidatesService } from '../src/spp/advancement-kind-candidates.service';
import { AdvancementOrderDeductionService } from '../src/spp/advancement-order-deduction.service';
import { AdvancementPricingModelService } from '../src/spp/advancement-pricing-model.service';
import { AdvancementSpendRangeService } from '../src/spp/advancement-spend-range.service';
import { StoredUnspentSppSettlementService } from '../src/spp/stored-unspent-spp-settlement.service';
import { UnspentSppService } from '../src/spp/unspent-spp.service';
import { UnspentSppCombinationService } from '../src/spp/unspent-spp-combination.service';
import { connectTestDb } from './e2e-database';
import {
  LONER_PLAYER_SPENT,
  seedLonerPlayer,
} from './loner-player.test-helpers';

describe('A gained Loner is a free extra in the order deduction (real Postgres)', () => {
  let db: Db;
  let playerSkills: PlayerSkillsService;
  let unspentSpp: UnspentSppService;
  let deduction: AdvancementOrderDeductionService;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerSkillsService,
        PlayerAdvancementSyncPlannerService,
        CharacteristicAdvancementPlannerService,
        PaidAdvancementSlotsService,
        UnspentSppService,
        AdvancementKindCandidatesService,
        AdvancementSpendRangeService,
        AdvancementPricingModelService,
        StoredUnspentSppSettlementService,
        UnspentSppCombinationService,
        AdvancementOrderDeductionService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    playerSkills = moduleRef.get(PlayerSkillsService);
    unspentSpp = moduleRef.get(UnspentSppService);
    deduction = moduleRef.get(AdvancementOrderDeductionService);
  });

  it('stores the gained Loner free, so the spend confirms the two paid skills', async () => {
    const { playerId, skillIds } = await seedLonerPlayer(db);
    const written = await playerSkills.sync({
      entries: [
        {
          playerId,
          skillId: skillIds.Block,
          source: 'chosen',
          advancementOrder: 1,
        },
        {
          playerId,
          skillId: skillIds.Loner,
          source: 'advancement',
          attributeValue: '4+',
          advancementOrder: 2,
        },
        {
          playerId,
          skillId: skillIds.Dodge,
          source: 'random',
          advancementOrder: 3,
        },
      ],
    });
    const [blockRow, lonerRow, dodgeRow] = written.playerSkillIds;
    const inputs = await unspentSpp.advancementInputsForPlayers([playerId]);

    const numbers = deduction.deduce({
      rulesSets: inputs.get(playerId) ?? [],
      newRowIds: [blockRow, dodgeRow],
      firstNumber: 1,
      spent: LONER_PLAYER_SPENT,
    });

    expect(numbers).toEqual(
      new Map([
        [blockRow, 1],
        [dodgeRow, 2],
      ]),
    );
    const [loner] = await db
      .select({ isFreeExtra: playerAdvancements.isFreeExtra })
      .from(playerAdvancements)
      .where(eq(playerAdvancements.id, lonerRow));
    expect(loner.isFreeExtra).toBe(true);
  });
});
