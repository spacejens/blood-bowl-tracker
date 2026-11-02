import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionGroups,
  competitions,
  DB,
  eras,
  leagues,
  players,
  positions,
  races,
  skills,
  teamEras,
  teams,
  trophies,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicAdvancementPlannerService } from '../src/player-skills/characteristic-advancement-planner.service';
import { PlayerAdvancementReadsService } from '../src/player-skills/player-advancement-reads.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { connectTestDb } from './e2e-database';

interface Fixtures {
  playerId: number;
  otherPlayerId: number;
  /** Skill name -> id: Block, Dodge, Hatred, Tentacles. */
  skillIds: Record<string, number>;
}

/**
 * Two players on one team; the first holds a trophy award granting
 * Tentacles, the second none.
 */
async function seed(db: Db): Promise<Fixtures> {
  const [league] = await db.insert(leagues).values({ name: 'L' }).returning();
  const [era] = await db
    .insert(eras)
    .values({ name: 'E', leagueId: league.id, startDate: '2020-01-01' })
    .returning();
  const [coach] = await db.insert(coaches).values({ name: 'C' }).returning();
  const [race] = await db.insert(races).values({ name: 'R' }).returning();
  const [team] = await db
    .insert(teams)
    .values({ name: 'T', raceId: race.id, coachId: coach.id })
    .returning();
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId: team.id, eraId: era.id })
    .returning();
  const [group] = await db
    .insert(competitionGroups)
    .values({ name: 'G', leagueId: league.id, namePattern: '^G$' })
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({
      name: 'S',
      type: 'season',
      eraId: era.id,
      competitionGroupId: group.id,
      startDate: '2020-02-01',
    })
    .returning();
  const [position] = await db
    .insert(positions)
    .values({ name: 'P', isStarPlayer: false })
    .returning();
  const [player, otherPlayer] = await db
    .insert(players)
    .values(
      ['A', 'B'].map((name) => ({
        name,
        teamEraId: teamEra.id,
        positionId: position.id,
      })),
    )
    .returning();
  const skillRows = await db
    .insert(skills)
    .values(['Block', 'Dodge', 'Hatred', 'Tentacles'].map((name) => ({ name })))
    .returning();
  const skillIds = Object.fromEntries(
    skillRows.map((row) => [row.name, row.id]),
  );
  const [trophy] = await db
    .insert(trophies)
    .values({
      name: 'Most Valuable Player',
      recipientKind: 'player',
      competitionGroupId: group.id,
      leagueId: null,
      awardRuleKind: 'manual',
      awardProcedure: 'Voted on by all coaches after the season.',
    })
    .returning();
  await db.insert(trophyAwards).values({
    trophyId: trophy.id,
    competitionId: competition.id,
    teamEraId: teamEra.id,
    playerId: player.id,
    grantedSkillId: skillIds.Tentacles,
  });
  return { playerId: player.id, otherPlayerId: otherPlayer.id, skillIds };
}

describe('Resolving free extras before a sync (real Postgres)', () => {
  let db: Db;
  let service: PlayerAdvancementReadsService;
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
        PlayerAdvancementReadsService,
        PlayerAdvancementSyncPlannerService,
        CharacteristicAdvancementPlannerService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayerAdvancementReadsService);
  });

  function entry(
    skill: string,
    overrides: Partial<PlayerSkillEntry> = {},
  ): PlayerSkillEntry {
    return {
      playerId: fixtures.playerId,
      skillId: fixtures.skillIds[skill],
      source: 'chosen',
      advancementOrder: 1,
      ...overrides,
    };
  }

  it('flags gained skills the sync stores free, and only those', async () => {
    const entries = [
      entry('Tentacles'),
      entry('Hatred'),
      entry('Hatred', { source: 'starting', playerId: fixtures.otherPlayerId }),
      entry('Tentacles', { playerId: fixtures.otherPlayerId }),
      entry('Block'),
      entry('Dodge', { isFreeExtra: true }),
    ];

    expect(await service.resolveFreeExtras(entries)).toEqual([
      { ...entries[0], isFreeExtra: true },
      { ...entries[1], isFreeExtra: true },
      entries[2],
      entries[3],
      entries[4],
      entries[5],
    ]);
  });
});
