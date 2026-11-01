import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionGroups,
  competitions,
  DB,
  eq,
  eras,
  leagues,
  players,
  playerSkills,
  positions,
  races,
  skills,
  teamEras,
  teams,
  trophies,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { UnspentSppDecisionService } from '../src/spp/unspent-spp-decision.service';
import { TrophyAwardsService } from '../src/trophy-awards/trophy-awards.service';
import { connectTestDb } from './e2e-database';

interface Fixtures {
  competitionId: number;
  playerId: number;
  trophyIds: [number, number];
  tentaclesId: number;
  twoHeadsId: number;
  hatredId: number;
}

/** A player holding gained rows of three skills, none yet flagged free. */
async function seed(db: Db): Promise<Fixtures> {
  const [league] = await db
    .insert(leagues)
    .values({ name: 'Test League' })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({ name: 'Test Era', leagueId: league.id, startDate: '2020-01-01' })
    .returning();
  const [coach] = await db
    .insert(coaches)
    .values({ name: 'Test Coach' })
    .returning();
  const [race] = await db
    .insert(races)
    .values({ name: 'Test Race' })
    .returning();
  const [team] = await db
    .insert(teams)
    .values({ name: 'Test Team', raceId: race.id, coachId: coach.id })
    .returning();
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId: team.id, eraId: era.id })
    .returning();
  const [group] = await db
    .insert(competitionGroups)
    .values({
      name: 'Major Season',
      leagueId: league.id,
      namePattern: '^Major Season\\s*\\d+$',
    })
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({
      name: 'Season 1',
      type: 'season',
      eraId: era.id,
      competitionGroupId: group.id,
      startDate: '2020-02-01',
    })
    .returning();
  const [position] = await db
    .insert(positions)
    .values({ name: 'Blitzer', isStarPlayer: false })
    .returning();
  const [player] = await db
    .insert(players)
    .values({
      name: 'Test Player',
      teamEraId: teamEra.id,
      positionId: position.id,
    })
    .returning();
  const trophyIds: number[] = [];
  for (const name of ['Most Valuable Player', 'Best Newcomer']) {
    const [trophy] = await db
      .insert(trophies)
      .values({
        name,
        recipientKind: 'player',
        competitionGroupId: group.id,
        leagueId: null,
        awardRuleKind: 'manual',
        awardProcedure: 'Voted on by all coaches after the season.',
      })
      .returning();
    trophyIds.push(trophy.id);
  }
  const [tentacles] = await db
    .insert(skills)
    .values({ name: 'Tentacles' })
    .returning();
  const [twoHeads] = await db
    .insert(skills)
    .values({ name: 'Two Heads' })
    .returning();
  const [hatred] = await db
    .insert(skills)
    .values({ name: 'Hatred' })
    .returning();
  for (const skill of [tentacles, twoHeads, hatred]) {
    await db.insert(playerSkills).values({
      playerId: player.id,
      skillId: skill.id,
      source: 'chosen',
      attributeValue: null,
      advancementOrder: 1,
    });
  }
  return {
    competitionId: competition.id,
    playerId: player.id,
    trophyIds: [trophyIds[0], trophyIds[1]],
    tentaclesId: tentacles.id,
    twoHeadsId: twoHeads.id,
    hatredId: hatred.id,
  };
}

describe('Changing a trophy award granted skill (real Postgres)', () => {
  let db: Db;
  let service: TrophyAwardsService;
  let fixtures: Fixtures;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    fixtures = await seed(db);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophyAwardsService,
        PlayerSkillsService,
        { provide: DB, useValue: db },
        {
          provide: UnspentSppDecisionService,
          useValue: mock<UnspentSppDecisionService>(),
        },
      ],
    }).compile();
    service = moduleRef.get(TrophyAwardsService);
  });

  async function freeSkillIds(): Promise<number[]> {
    const rows = await db.select().from(playerSkills);
    return rows
      .filter((row) => row.isFreeExtra)
      .map((row) => row.skillId)
      .sort((a, b) => a - b);
  }

  function award(
    trophyIndex: 0 | 1,
    grantedSkillId?: number | null,
  ): Parameters<TrophyAwardsService['upsert']>[0] {
    return {
      trophyId: fixtures.trophyIds[trophyIndex],
      competitionId: fixtures.competitionId,
      playerId: fixtures.playerId,
      grantedSkillId,
    };
  }

  it('marks the granted skill free on a new award', async () => {
    await service.upsert(award(0, fixtures.tentaclesId));

    expect(await freeSkillIds()).toEqual([fixtures.tentaclesId]);
  });

  it('unmarks the old skill and marks the new one when the skill changes', async () => {
    await service.upsert(award(0, fixtures.tentaclesId));

    await service.upsert(award(0, fixtures.twoHeadsId));

    expect(await freeSkillIds()).toEqual([fixtures.twoHeadsId]);
  });

  it('unmarks the old skill when the skill is cleared', async () => {
    await service.upsert(award(0, fixtures.tentaclesId));

    await service.upsert(award(0, null));

    expect(await freeSkillIds()).toEqual([]);
  });

  it('keeps the old skill free while another award of the player grants it', async () => {
    await service.upsert(award(0, fixtures.tentaclesId));
    await service.upsert(award(1, fixtures.tentaclesId));

    await service.upsert(award(0, fixtures.twoHeadsId));

    expect(await freeSkillIds()).toEqual(
      [fixtures.tentaclesId, fixtures.twoHeadsId].sort((a, b) => a - b),
    );
  });

  it('never unmarks Hatred, which is free by its own rule', async () => {
    await service.upsert(award(0, fixtures.hatredId));
    await db
      .update(playerSkills)
      .set({ isFreeExtra: true })
      .where(eq(playerSkills.skillId, fixtures.hatredId));

    await service.upsert(award(0, null));

    expect(await freeSkillIds()).toEqual([fixtures.hatredId]);
  });
});
