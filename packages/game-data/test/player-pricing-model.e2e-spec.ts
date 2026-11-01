import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  coaches,
  DB,
  eraRulesSets,
  eras,
  leagues,
  players,
  positions,
  races,
  rulesSets,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import type { AdvancementKind } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AdvancementPricingModelService } from '../src/spp/advancement-pricing-model.service';
import { PlayerPricingModelService } from '../src/spp/player-pricing-model.service';
import { connectTestDb } from './e2e-database';

/** One player per scenario, each in an era of its own. */
interface SeededPlayers {
  fixed: number;
  typed: number;
  mixed: number;
  abstaining: number;
  noCosts: number;
}

async function insertOne<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  return row;
}

/** One rules set's cost rows of one kind, numbered from 1. */
function costRows(options: {
  rulesSetId: number;
  advancementKind: AdvancementKind;
  sppCosts: number[];
  leagueId?: number | null;
}) {
  const { rulesSetId, advancementKind, sppCosts, leagueId = null } = options;
  return sppCosts.map((sppCost, index) => ({
    rulesSetId,
    leagueId,
    advancementNumber: index + 1,
    advancementKind,
    sppCost,
  }));
}

async function seed(db: Db): Promise<SeededPlayers> {
  const league = await insertOne(
    db.insert(leagues).values({ name: 'tLoEG' }).returning(),
  );
  const rulesSet = (name: string) =>
    insertOne(db.insert(rulesSets).values({ name }).returning());
  const crp = await rulesSet('CRP');
  const bb2020 = await rulesSet('BB2020');
  const bb2025 = await rulesSet('BB2025');

  await db.insert(advancementCosts).values([
    ...costRows({
      rulesSetId: crp.id,
      advancementKind: 'table_roll',
      sppCosts: [6, 16, 31],
    }),
    // A house rule on top of CRP: it must not turn CRP kind-priced.
    ...costRows({
      rulesSetId: crp.id,
      advancementKind: 'chosen_primary_skill',
      sppCosts: [50],
      leagueId: league.id,
    }),
    ...costRows({
      rulesSetId: bb2020.id,
      advancementKind: 'random_primary_skill',
      sppCosts: [3, 4, 6],
    }),
    ...costRows({
      rulesSetId: bb2020.id,
      advancementKind: 'chosen_primary_skill',
      sppCosts: [6, 8, 12],
    }),
    // BB2025 has only a league row, so it has no costs of its own.
    ...costRows({
      rulesSetId: bb2025.id,
      advancementKind: 'table_roll',
      sppCosts: [20],
      leagueId: league.id,
    }),
  ]);

  const era = async (name: string, rulesSetIds: number[]) => {
    const row = await insertOne(
      db
        .insert(eras)
        .values({ name, leagueId: league.id, startDate: '2020-01-01' })
        .returning(),
    );
    await db
      .insert(eraRulesSets)
      .values(rulesSetIds.map((rulesSetId) => ({ eraId: row.id, rulesSetId })));
    return row.id;
  };

  const coach = await insertOne(
    db.insert(coaches).values({ name: 'Test Coach' }).returning(),
  );
  const race = await insertOne(
    db.insert(races).values({ name: 'Human' }).returning(),
  );
  const team = await insertOne(
    db
      .insert(teams)
      .values({ name: 'Test Team', raceId: race.id, coachId: coach.id })
      .returning(),
  );
  const lineman = await insertOne(
    db
      .insert(positions)
      .values({ name: 'Lineman', isStarPlayer: false })
      .returning(),
  );
  const playerIn = async (name: string, eraId: number) => {
    const teamEra = await insertOne(
      db.insert(teamEras).values({ teamId: team.id, eraId }).returning(),
    );
    const player = await insertOne(
      db
        .insert(players)
        .values({ name, teamEraId: teamEra.id, positionId: lineman.id })
        .returning(),
    );
    return player.id;
  };

  return {
    fixed: await playerIn('Fixed', await era('Fixed Era', [crp.id])),
    typed: await playerIn('Typed', await era('Typed Era', [bb2020.id])),
    mixed: await playerIn('Mixed', await era('Mixed Era', [crp.id, bb2020.id])),
    abstaining: await playerIn(
      'Abstaining',
      await era('Abstaining Era', [bb2020.id, bb2025.id]),
    ),
    noCosts: await playerIn('No Costs', await era('No Costs Era', [bb2025.id])),
  };
}

describe('PlayerPricingModelService (real Postgres)', () => {
  let db: Db;
  let service: PlayerPricingModelService;
  let seeded: SeededPlayers;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    seeded = await seed(db);
    // AdvancementPricingModelService is pure and dependency-free, so it is real.
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerPricingModelService,
        AdvancementPricingModelService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayerPricingModelService);
  });

  it('reads a fixed-threshold era, ignoring a league house rule', async () => {
    await expect(service.pricingModelForPlayer(seeded.fixed)).resolves.toBe(
      'fixed_threshold',
    );
  });

  it('reads a kind-priced era', async () => {
    await expect(service.pricingModelForPlayer(seeded.typed)).resolves.toBe(
      'kind_priced',
    );
  });

  it('gives no model when the era rules sets disagree', async () => {
    await expect(
      service.pricingModelForPlayer(seeded.mixed),
    ).resolves.toBeNull();
  });

  it('lets a rules set with only league rows abstain', async () => {
    await expect(
      service.pricingModelForPlayer(seeded.abstaining),
    ).resolves.toBe('kind_priced');
  });

  it('gives no model when no rules set has costs of its own', async () => {
    await expect(
      service.pricingModelForPlayer(seeded.noCosts),
    ).resolves.toBeNull();
  });

  it('gives no model for a player that does not exist', async () => {
    const missing =
      Math.max(
        seeded.fixed,
        seeded.typed,
        seeded.mixed,
        seeded.abstaining,
        seeded.noCosts,
      ) + 1000;
    await expect(service.pricingModelForPlayer(missing)).resolves.toBeNull();
  });
});
