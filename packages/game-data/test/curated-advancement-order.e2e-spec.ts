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
import { PlayerAdvancementReadsService } from '../src/player-skills/player-advancement-reads.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { CuratedAdvancementOrderError } from '../src/shared/curated-advancement-order-error';
import { AdvancementKindCandidatesService } from '../src/spp/advancement-kind-candidates.service';
import { AdvancementOrderDeductionService } from '../src/spp/advancement-order-deduction.service';
import { AdvancementOrderSpendCheckService } from '../src/spp/advancement-order-spend-check.service';
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
        PlayerAdvancementReadsService,
        CharacteristicAdvancementPlannerService,
        PaidAdvancementSlotsService,
        UnspentSppService,
        AdvancementKindCandidatesService,
        AdvancementSpendRangeService,
        AdvancementPricingModelService,
        StoredUnspentSppSettlementService,
        UnspentSppCombinationService,
        AdvancementOrderDeductionService,
        AdvancementOrderSpendCheckService,
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

  it('writes the order confirmed, unchecked, when the SPP figures are unknown', async () => {
    await db
      .update(players)
      .set({ unspentSpp: null })
      .where(eq(players.id, seeded.playerId));

    await service.sync(curated('Dodge'));

    const rows = await db
      .select({
        skillId: playerAdvancements.skillId,
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
      { skillId: seeded.skillIds.Dodge, orderConfirmed: true },
      { skillId: seeded.skillIds.Block, orderConfirmed: true },
    ]);
  });

  it('refuses a Loner listed as paid although the free-extra rule covers it', async () => {
    await db
      .update(playerAdvancements)
      .set({ isFreeExtra: false })
      .where(eq(playerAdvancements.skillId, seeded.skillIds.Loner));
    const data = curated('Block');
    data.entries.push({
      playerId: seeded.playerId,
      skillId: seeded.skillIds.Loner,
      source: 'advancement',
      attributeValue: '4+',
      advancementOrder: 3,
      orderConfirmed: true,
    });

    await expect(service.sync(data)).rejects.toThrow(/not a paid advancement/);
  });

  describe('with a stored gained Loner stored before the name rule flagged it', () => {
    const rows = () =>
      db
        .select({
          skillId: playerAdvancements.skillId,
          advancementOrder: playerAdvancements.advancementOrder,
          orderConfirmed: playerAdvancements.orderConfirmed,
          isFreeExtra: playerAdvancements.isFreeExtra,
        })
        .from(playerAdvancements)
        .where(eq(playerAdvancements.playerId, seeded.playerId))
        .orderBy(asc(playerAdvancements.id));

    beforeEach(async () => {
      // As a row stored before the rule: a paid-looking Loner holding slot 2.
      await db
        .update(playerAdvancements)
        .set({ isFreeExtra: false })
        .where(eq(playerAdvancements.skillId, seeded.skillIds.Loner));
      await db
        .update(playerAdvancements)
        .set({ orderConfirmed: true })
        .where(eq(playerAdvancements.playerId, seeded.playerId));
    });

    it('flags the Loner free and confirms the paid order 1..2 in one apply', async () => {
      const result = await service.sync(curated('Block'));

      expect(result.playerSkillIds).toHaveLength(2);
      expect(await rows()).toEqual([
        {
          skillId: seeded.skillIds.Block,
          advancementOrder: 1,
          orderConfirmed: true,
          isFreeExtra: false,
        },
        {
          skillId: seeded.skillIds.Loner,
          advancementOrder: 2,
          orderConfirmed: false,
          isFreeExtra: true,
        },
        {
          skillId: seeded.skillIds.Dodge,
          advancementOrder: 2,
          orderConfirmed: true,
          isFreeExtra: false,
        },
      ]);
      const [player] = await db
        .select({ unspentSpp: players.unspentSpp })
        .from(players)
        .where(eq(players.id, seeded.playerId));
      expect(player.unspentSpp).toBe(0);
    });

    it('writes nothing, the Loner flag included, when the order is refused', async () => {
      const before = await rows();

      await expect(service.sync(curated('Dodge'))).rejects.toThrow(
        CuratedAdvancementOrderError,
      );

      expect(await rows()).toEqual(before);
      expect(before[1]).toMatchObject({
        skillId: seeded.skillIds.Loner,
        isFreeExtra: false,
      });
    });
  });
});
