import type { SyncPlayerSkills } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  eq,
  playerAdvancements,
  players,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CuratedAdvancementOrderService } from '../src/curated-advancement-order/curated-advancement-order.service';
import { CharacteristicAdvancementPlannerService } from '../src/player-skills/characteristic-advancement-planner.service';
import { CuratedAdvancementOrderMatcherService } from '../src/player-skills/curated-advancement-order-matcher.service';
import { PaidAdvancementSlotsService } from '../src/player-skills/paid-advancement-slots.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { CuratedAdvancementOrderError } from '../src/shared/curated-advancement-order-error';
import { AdvancementKindCandidatesService } from '../src/spp/advancement-kind-candidates.service';
import { AdvancementOrderDeductionService } from '../src/spp/advancement-order-deduction.service';
import { AdvancementPricingModelService } from '../src/spp/advancement-pricing-model.service';
import { AdvancementSpendRangeService } from '../src/spp/advancement-spend-range.service';
import { StoredUnspentSppSettlementService } from '../src/spp/stored-unspent-spp-settlement.service';
import { UnspentSppService } from '../src/spp/unspent-spp.service';
import { UnspentSppCombinationService } from '../src/spp/unspent-spp-combination.service';
import { connectTestDb } from './e2e-database';
import type { LonerPlayerSeed } from './loner-player.test-helpers';
import { seedLonerPlayer } from './loner-player.test-helpers';

describe('Curated advancement orders are checked against the spend (real Postgres)', () => {
  let db: Db;
  let service: CuratedAdvancementOrderService;
  let seeded: LonerPlayerSeed;

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
        CuratedAdvancementOrderService,
        CuratedAdvancementOrderMatcherService,
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
    service = moduleRef.get(CuratedAdvancementOrderService);
    seeded = await seedLonerPlayer(db);
    const { playerId, skillIds } = seeded;
    await moduleRef.get(PlayerSkillsService).sync({
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
    // The first sync cleared the stored unspent SPP.
    await db
      .update(players)
      .set({ unspentSpp: 0 })
      .where(eq(players.id, playerId));
  });

  const curated = (first: 'Block' | 'Dodge'): SyncPlayerSkills => {
    const second = first === 'Block' ? 'Dodge' : 'Block';
    return {
      entries: [
        {
          playerId: seeded.playerId,
          skillId: seeded.skillIds[first],
          source: 'advancement',
          advancementOrder: 1,
          orderConfirmed: true,
        },
        {
          playerId: seeded.playerId,
          skillId: seeded.skillIds[second],
          source: 'advancement',
          advancementOrder: 2,
          orderConfirmed: true,
        },
      ],
      characteristicPlayerIds: [seeded.playerId],
      checkOrderAgainstSpend: true,
    };
  };

  it('confirms an order the spend allows, keeping sources and the unspent SPP', async () => {
    await service.sync(curated('Block'));

    const rows = await db
      .select({
        skillId: playerAdvancements.skillId,
        source: playerAdvancements.source,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
      })
      .from(playerAdvancements)
      .where(
        and(
          eq(playerAdvancements.playerId, seeded.playerId),
          eq(playerAdvancements.isFreeExtra, false),
        ),
      )
      .orderBy(asc(playerAdvancements.advancementOrder));
    expect(rows).toEqual([
      {
        skillId: seeded.skillIds.Block,
        source: 'chosen',
        advancementOrder: 1,
        orderConfirmed: true,
      },
      {
        skillId: seeded.skillIds.Dodge,
        source: 'random',
        advancementOrder: 2,
        orderConfirmed: true,
      },
    ]);
    const [player] = await db
      .select({ unspentSpp: players.unspentSpp })
      .from(players)
      .where(eq(players.id, seeded.playerId));
    expect(player.unspentSpp).toBe(0);
  });

  it('refuses an order that contradicts the spend and writes nothing', async () => {
    await expect(service.sync(curated('Dodge'))).rejects.toThrow(
      CuratedAdvancementOrderError,
    );

    const confirmed = await db
      .select({ id: playerAdvancements.id })
      .from(playerAdvancements)
      .where(
        and(
          eq(playerAdvancements.playerId, seeded.playerId),
          eq(playerAdvancements.orderConfirmed, true),
        ),
      );
    expect(confirmed).toEqual([]);
  });
});
