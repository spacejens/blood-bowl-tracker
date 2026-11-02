import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  and,
  coaches,
  DB,
  eq,
  eraRulesSets,
  eras,
  inArray,
  leagues,
  playerAdvancements,
  playerAdvancementsHistory,
  players,
  positionRulesSets,
  positionRulesSetSkillCategories,
  positions,
  races,
  rulesSets,
  skillRulesSets,
  skills,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import type {
  AdvancementKind,
  PlayerSkillSource,
} from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { CharacteristicAdvancementPlannerService } from '../src/player-skills/characteristic-advancement-planner.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { AdvancementKindCandidatesService } from '../src/spp/advancement-kind-candidates.service';
import { AdvancementPricingModelService } from '../src/spp/advancement-pricing-model.service';
import { AdvancementSpendRangeService } from '../src/spp/advancement-spend-range.service';
import { BblSkillSourceInferenceService } from '../src/spp/bbl-skill-source-inference.service';
import { SppAdjustmentsService } from '../src/spp/spp-adjustments.service';
import { SppForcedRateService } from '../src/spp/spp-forced-rate.service';
import { SppOngoingEstimateService } from '../src/spp/spp-ongoing-estimate.service';
import { SppTotalsService } from '../src/spp/spp-totals.service';
import { StoredUnspentSppSettlementService } from '../src/spp/stored-unspent-spp-settlement.service';
import { UnspentSppService } from '../src/spp/unspent-spp.service';
import { UnspentSppCombinationService } from '../src/spp/unspent-spp-combination.service';
import { UnspentSppDecisionService } from '../src/spp/unspent-spp-decision.service';
import { connectTestDb } from './e2e-database';

interface SeededPlayers {
  /** A primary and a secondary skill the spend tells apart. */
  settled: number;
  /** Two primary skills that could swap. */
  ambiguous: number;
  /** A gained skill but no unspent figure on the page. */
  unreported: number;
  /** A gained skill and a characteristic increase. */
  raised: number;
}

async function insertOne<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  return row;
}

function costRows(
  rulesSetId: number,
  advancementKind: AdvancementKind,
  sppCosts: number[],
) {
  return sppCosts.map((sppCost, index) => ({
    rulesSetId,
    advancementNumber: index + 1,
    advancementKind,
    sppCost,
  }));
}

/** One BB2020 era, a Lineman with general primary and agility secondary. */
async function seed(db: Db): Promise<SeededPlayers> {
  const league = await insertOne(
    db.insert(leagues).values({ name: 'BBL' }).returning(),
  );
  const bb2020 = await insertOne(
    db.insert(rulesSets).values({ name: 'BB2020' }).returning(),
  );
  const era = await insertOne(
    db
      .insert(eras)
      .values({ name: 'Era', leagueId: league.id, startDate: '2020-01-01' })
      .returning(),
  );
  await db
    .insert(eraRulesSets)
    .values({ eraId: era.id, rulesSetId: bb2020.id });

  const skillRows = await db
    .insert(skills)
    .values(['Block', 'Tackle', 'Sidestep', 'Dodge'].map((name) => ({ name })))
    .returning();
  const skill = Object.fromEntries(skillRows.map((row) => [row.name, row.id]));
  await db.insert(skillRulesSets).values([
    { skillId: skill.Block, rulesSetId: bb2020.id, category: 'general' },
    { skillId: skill.Tackle, rulesSetId: bb2020.id, category: 'general' },
    { skillId: skill.Sidestep, rulesSetId: bb2020.id, category: 'agility' },
    { skillId: skill.Dodge, rulesSetId: bb2020.id, category: 'agility' },
  ]);
  await db
    .insert(advancementCosts)
    .values([
      ...costRows(bb2020.id, 'random_primary_skill', [3, 4, 6, 8, 10, 15]),
      ...costRows(bb2020.id, 'chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
      ...costRows(bb2020.id, 'random_secondary_skill', [6, 8, 12, 16, 20, 30]),
      ...costRows(
        bb2020.id,
        'chosen_secondary_skill',
        [12, 14, 18, 22, 26, 40],
      ),
      ...costRows(bb2020.id, 'random_characteristic', [18, 20, 24, 28, 32, 50]),
    ]);

  const lineman = await insertOne(
    db
      .insert(positions)
      .values({ name: 'Lineman', isStarPlayer: false })
      .returning(),
  );
  const linemanBb2020 = await insertOne(
    db
      .insert(positionRulesSets)
      .values({
        positionId: lineman.id,
        rulesSetId: bb2020.id,
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      })
      .returning(),
  );
  await db.insert(positionRulesSetSkillCategories).values([
    {
      positionRulesSetId: linemanBb2020.id,
      skillCategory: 'general',
      access: 'primary',
    },
    {
      positionRulesSetId: linemanBb2020.id,
      skillCategory: 'agility',
      access: 'secondary',
    },
  ]);

  const coach = await insertOne(
    db.insert(coaches).values({ name: 'Coach' }).returning(),
  );
  const race = await insertOne(
    db.insert(races).values({ name: 'Human' }).returning(),
  );
  const team = await insertOne(
    db
      .insert(teams)
      .values({ name: 'Team', raceId: race.id, coachId: coach.id })
      .returning(),
  );
  const teamEra = await insertOne(
    db.insert(teamEras).values({ teamId: team.id, eraId: era.id }).returning(),
  );
  const player = async (name: string) =>
    (
      await insertOne(
        db
          .insert(players)
          .values({ name, teamEraId: teamEra.id, positionId: lineman.id })
          .returning(),
      )
    ).id;
  const give = (
    playerId: number,
    names: string[],
    source: PlayerSkillSource = 'advancement',
  ) =>
    db
      .insert(playerAdvancements)
      .values(
        names.map((name) => ({ playerId, skillId: skill[name], source })),
      );

  const settled = await player('Settled');
  await give(settled, ['Dodge'], 'starting');
  await give(settled, ['Block', 'Sidestep']);
  const ambiguous = await player('Ambiguous');
  await give(ambiguous, ['Block', 'Tackle']);
  const unreported = await player('Unreported');
  await give(unreported, ['Block']);
  const raised = await player('Raised');
  await give(raised, ['Tackle']);
  await db.insert(playerAdvancements).values({
    playerId: raised,
    source: 'characteristic',
    characteristic: 'ST',
  });
  return { settled, ambiguous, unreported, raised };
}

describe('BBL skill source inference in the closing SPP sync (real Postgres)', () => {
  let db: Db;
  let seeded: SeededPlayers;
  let adjustments: SppAdjustmentsService;
  let playerSkillsService: PlayerSkillsService;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    seeded = await seed(db);
    // No match events are seeded: with both event sums at 0 the stored
    // spp_total is the scraped total, so BBL's unspent figure is kept.
    const zeroes = (ids: number[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, 0])));
    const totals = mock<SppTotalsService>();
    totals.totalsForPlayers.mockImplementation(zeroes);
    const forcedRate = mock<SppForcedRateService>();
    forcedRate.forcedRateSumsForPlayers.mockImplementation(zeroes);
    const moduleRef = await Test.createTestingModule({
      providers: [
        SppAdjustmentsService,
        PlayerSkillsService,
        PlayerAdvancementSyncPlannerService,
        CharacteristicAdvancementPlannerService,
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
        { provide: SppForcedRateService, useValue: forcedRate },
        {
          provide: SppOngoingEstimateService,
          useValue: mock<SppOngoingEstimateService>(),
        },
      ],
    }).compile();
    adjustments = moduleRef.get(SppAdjustmentsService);
    playerSkillsService = moduleRef.get(PlayerSkillsService);
  });

  async function sources(
    playerId: number,
  ): Promise<Record<string, PlayerSkillSource>> {
    const rows = await db
      .select({ name: skills.name, source: playerAdvancements.source })
      .from(playerAdvancements)
      .innerJoin(skills, eq(skills.id, playerAdvancements.skillId))
      .where(eq(playerAdvancements.playerId, playerId));
    return Object.fromEntries(rows.map((row) => [row.name, row.source]));
  }

  async function storedUnspent(playerId: number): Promise<number | null> {
    const [row] = await db
      .select({ unspentSpp: players.unspentSpp })
      .from(players)
      .where(eq(players.id, playerId));
    return row.unspentSpp;
  }

  function sync() {
    return adjustments.syncScrapedAdjustments({
      players: [
        // Spent 17: only a random primary then a chosen secondary.
        { playerId: seeded.settled, scrapedTotal: 20, reportedUnspentSpp: 3 },
        // Spent 11: a random and a chosen primary, in either order.
        { playerId: seeded.ambiguous, scrapedTotal: 14, reportedUnspentSpp: 3 },
        { playerId: seeded.unreported, scrapedTotal: 3 },
        // Spent 22: only a random characteristic then a random primary.
        { playerId: seeded.raised, scrapedTotal: 25, reportedUnspentSpp: 3 },
      ],
    });
  }

  it('records the sources the reported spend settles and leaves the rest', async () => {
    await sync();

    expect(await sources(seeded.settled)).toEqual({
      Dodge: 'starting',
      Block: 'random',
      Sidestep: 'chosen',
    });
    expect(await sources(seeded.ambiguous)).toEqual({
      Block: 'advancement',
      Tackle: 'advancement',
    });
    expect(await sources(seeded.unreported)).toEqual({ Block: 'advancement' });
    expect(await storedUnspent(seeded.settled)).toBe(3);
  });

  it('counts a characteristic increase towards the spend and only rewrites the skill', async () => {
    await sync();

    expect(await sources(seeded.raised)).toEqual({ Tackle: 'random' });
    expect(
      await db
        .select({
          skillId: playerAdvancements.skillId,
          characteristic: playerAdvancements.characteristic,
          source: playerAdvancements.source,
        })
        .from(playerAdvancements)
        .where(
          and(
            eq(playerAdvancements.playerId, seeded.raised),
            eq(playerAdvancements.source, 'characteristic'),
          ),
        ),
    ).toEqual([
      { skillId: null, characteristic: 'ST', source: 'characteristic' },
    ]);
  });

  it('keeps the settled sources when a re-run re-sends them as advancement', async () => {
    await sync();
    const historyBefore = await db.select().from(playerAdvancementsHistory);
    const skillRows = await db
      .select({
        playerId: playerAdvancements.playerId,
        skillId: playerAdvancements.skillId,
        source: playerAdvancements.source,
      })
      .from(playerAdvancements)
      .where(eq(playerAdvancements.playerId, seeded.settled));

    // The BBL import re-sends every gained skill as advancement.
    await playerSkillsService.sync({
      entries: skillRows.flatMap((row) =>
        row.skillId === null
          ? []
          : [
              {
                playerId: row.playerId,
                skillId: row.skillId,
                source:
                  row.source === 'starting'
                    ? ('starting' as const)
                    : ('advancement' as const),
              },
            ],
      ),
    });
    await sync();

    expect(await sources(seeded.settled)).toEqual({
      Dodge: 'starting',
      Block: 'random',
      Sidestep: 'chosen',
    });
    expect(await db.select().from(playerAdvancementsHistory)).toEqual(
      historyBefore,
    );
    expect(await storedUnspent(seeded.settled)).toBe(3);
  });

  it('leaves the stored unspent SPP alone when a skill re-sync after inference changes nothing', async () => {
    await sync();
    const historyBefore = await db.select().from(playerAdvancementsHistory);

    await playerSkillsService.sync({
      entries: (
        await db
          .select({
            playerId: playerAdvancements.playerId,
            skillId: playerAdvancements.skillId,
          })
          .from(playerAdvancements)
          .where(
            and(
              eq(playerAdvancements.playerId, seeded.settled),
              inArray(playerAdvancements.source, ['chosen', 'random']),
            ),
          )
      ).flatMap((row) =>
        row.skillId === null
          ? []
          : [{ ...row, skillId: row.skillId, source: 'advancement' as const }],
      ),
    });

    expect(await db.select().from(playerAdvancementsHistory)).toEqual(
      historyBefore,
    );
    expect(await storedUnspent(seeded.settled)).toBe(3);
  });
});
