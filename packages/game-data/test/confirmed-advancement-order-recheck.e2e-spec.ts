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
import { mock } from 'vitest-mock-extended';

import { CuratedAdvancementOrderService } from '../src/curated-advancement-order/curated-advancement-order.service';
import { CharacteristicAdvancementPlannerService } from '../src/player-skills/characteristic-advancement-planner.service';
import { CuratedAdvancementOrderMatcherService } from '../src/player-skills/curated-advancement-order-matcher.service';
import { PaidAdvancementSlotsService } from '../src/player-skills/paid-advancement-slots.service';
import { PlayerAdvancementReadsService } from '../src/player-skills/player-advancement-reads.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { AdvancementKindCandidatesService } from '../src/spp/advancement-kind-candidates.service';
import { AdvancementOrderDeductionService } from '../src/spp/advancement-order-deduction.service';
import { AdvancementOrderSpendCheckService } from '../src/spp/advancement-order-spend-check.service';
import { AdvancementPricingModelService } from '../src/spp/advancement-pricing-model.service';
import { AdvancementSpendRangeService } from '../src/spp/advancement-spend-range.service';
import { BblSkillSourceInferenceService } from '../src/spp/bbl-skill-source-inference.service';
import { ConfirmedAdvancementOrderRecheckService } from '../src/spp/confirmed-advancement-order-recheck.service';
import { SppAdjustmentsService } from '../src/spp/spp-adjustments.service';
import { SppForcedRateService } from '../src/spp/spp-forced-rate.service';
import { SppOngoingEstimateService } from '../src/spp/spp-ongoing-estimate.service';
import { SppTotalsService } from '../src/spp/spp-totals.service';
import { StoredUnspentSppSettlementService } from '../src/spp/stored-unspent-spp-settlement.service';
import { UnspentSppService } from '../src/spp/unspent-spp.service';
import { UnspentSppCombinationService } from '../src/spp/unspent-spp-combination.service';
import { UnspentSppDecisionService } from '../src/spp/unspent-spp-decision.service';
import { connectTestDb } from './e2e-database';
import type { LonerPlayerSeed } from './loner-player.test-helpers';
import {
  LONER_PLAYER_SPENT,
  seedLonerPlayer,
} from './loner-player.test-helpers';

describe('Confirmed advancement orders are rechecked once the SPP figures are stored (real Postgres)', () => {
  let db: Db;
  let curatedOrders: CuratedAdvancementOrderService;
  let adjustments: SppAdjustmentsService;
  let seeded: LonerPlayerSeed;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    // No match events are seeded, so the imported sum is 0 and the stored
    // total is the reported one.
    const totals = mock<SppTotalsService>();
    totals.totalsForPlayers.mockResolvedValue(new Map());
    const ongoing = mock<SppOngoingEstimateService>();
    ongoing.estimateForPlayers.mockResolvedValue(new Map());
    const moduleRef = await Test.createTestingModule({
      providers: [
        CuratedAdvancementOrderService,
        CuratedAdvancementOrderMatcherService,
        PlayerSkillsService,
        PlayerAdvancementSyncPlannerService,
        PlayerAdvancementReadsService,
        CharacteristicAdvancementPlannerService,
        PaidAdvancementSlotsService,
        SppAdjustmentsService,
        ConfirmedAdvancementOrderRecheckService,
        AdvancementOrderSpendCheckService,
        AdvancementOrderDeductionService,
        BblSkillSourceInferenceService,
        UnspentSppDecisionService,
        UnspentSppService,
        AdvancementKindCandidatesService,
        AdvancementSpendRangeService,
        AdvancementPricingModelService,
        StoredUnspentSppSettlementService,
        UnspentSppCombinationService,
        { provide: DB, useValue: db },
        { provide: SppTotalsService, useValue: totals },
        {
          provide: SppForcedRateService,
          useValue: mock<SppForcedRateService>(),
        },
        { provide: SppOngoingEstimateService, useValue: ongoing },
      ],
    }).compile();
    curatedOrders = moduleRef.get(CuratedAdvancementOrderService);
    adjustments = moduleRef.get(SppAdjustmentsService);
    seeded = await seedLonerPlayer(db);
    const { playerId, skillIds } = seeded;
    // As a scratch import's first TP pass: the skill sync clears the stored
    // unspent SPP, so the curated order below is written unchecked.
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

  /** The TP sync's payload; without the snapshot no unspent figure is stored. */
  const reported = (withUnspent: boolean) => ({
    players: [
      {
        playerId: seeded.playerId,
        reportedSppTotal: LONER_PLAYER_SPENT,
        ...(withUnspent
          ? {
              unspentSppSnapshot: {
                unspentSpp: 0,
                snapshotSppTotal: LONER_PLAYER_SPENT,
              },
            }
          : {}),
      },
    ],
  });

  const paidRows = () =>
    db
      .select({
        skillId: playerAdvancements.skillId,
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

  const storedUnspent = async () => {
    const [player] = await db
      .select({ unspentSpp: players.unspentSpp })
      .from(players)
      .where(eq(players.id, seeded.playerId));
    return player.unspentSpp;
  };

  it('reports an order the stored figures contradict, leaving it confirmed and unchanged', async () => {
    await curatedOrders.sync(curated('Dodge'));
    const before = await paidRows();

    const result = await adjustments.syncReportedAdjustments(reported(true));

    expect(result.updatedPlayerIds).toEqual([seeded.playerId]);
    expect(result.orderProblems).toEqual([
      {
        playerId: seeded.playerId,
        name: 'Nadiddnur-shaped',
        problem: `this order cannot cost exactly the ${LONER_PLAYER_SPENT} SPP reported as spent under any rules set of the player's era`,
      },
    ]);
    expect(await paidRows()).toEqual(before);
    expect(before).toEqual([
      {
        skillId: seeded.skillIds.Dodge,
        advancementOrder: 1,
        orderConfirmed: true,
      },
      {
        skillId: seeded.skillIds.Block,
        advancementOrder: 2,
        orderConfirmed: true,
      },
    ]);
    expect(await storedUnspent()).toBe(0);
  });

  it('reports nothing for an order the stored figures allow', async () => {
    await curatedOrders.sync(curated('Block'));

    const result = await adjustments.syncReportedAdjustments(reported(true));

    expect(result.orderProblems).toEqual([]);
  });

  it('reports nothing, and does not fail, while the unspent figure is still unknown', async () => {
    await curatedOrders.sync(curated('Dodge'));

    const result = await adjustments.syncReportedAdjustments(reported(false));

    expect(result.updatedPlayerIds).toEqual([seeded.playerId]);
    expect(result.orderProblems).toEqual([]);
    expect(await storedUnspent()).toBeNull();
  });
});
