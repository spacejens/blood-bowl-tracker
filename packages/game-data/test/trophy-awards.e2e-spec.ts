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
  teamEras,
  teams,
  trophies,
  trophyAwards,
  trophyAwardsHistory,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TrophyAwardsService } from '../src/trophy-awards/trophy-awards.service';
import { connectTestDb } from './e2e-database';

interface TrophyFixtures {
  competitionId: number;
  teamEraId: number;
  playerId: number;
  playerTrophyId: number;
  teamTrophyId: number;
}

/**
 * The minimum real rows a trophy award points at, inserted in
 * foreign-key order. There is no fixture-builder framework on purpose: each
 * e2e spec seeds exactly what it needs, inline.
 */
async function seedTrophyFixtures(db: Db): Promise<TrophyFixtures> {
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
    .values({ name: 'Major Season', leagueId: league.id })
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
  const [playerTrophy] = await db
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
  const [teamTrophy] = await db
    .insert(trophies)
    .values({
      name: '1st Place',
      recipientKind: 'team',
      competitionGroupId: group.id,
      leagueId: null,
      awardRuleKind: 'manual',
      awardProcedure: 'Taken from the season standings.',
    })
    .returning();

  return {
    competitionId: competition.id,
    teamEraId: teamEra.id,
    playerId: player.id,
    playerTrophyId: playerTrophy.id,
    teamTrophyId: teamTrophy.id,
  };
}

describe('TrophyAwardsService.upsert (real Postgres)', () => {
  let db: Db;
  let service: TrophyAwardsService;
  let fixtures: TrophyFixtures;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    fixtures = await seedTrophyFixtures(db);
    // The same Test.createTestingModule shape every other spec uses; the only
    // deviation from CLAUDE.md's "Testing services" section is that DB is
    // given a real migrated Db instead of mockDb(), which is the whole point
    // of an e2e spec. Direct instantiation stays forbidden.
    const moduleRef = await Test.createTestingModule({
      providers: [TrophyAwardsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(TrophyAwardsService);
  });

  it('records a player award once and returns the same row on re-award', async () => {
    const data = {
      trophyId: fixtures.playerTrophyId,
      competitionId: fixtures.competitionId,
      teamEraId: fixtures.teamEraId,
      playerId: fixtures.playerId,
    };

    const first = await service.upsert(data);
    expect(first.created).toBe(true);

    // The re-import case from issue #711: the second insert really does lose
    // the natural-key unique constraint inside Postgres, and the service reads
    // the existing row back instead of erroring.
    const second = await service.upsert(data);
    expect(second.created).toBe(false);
    expect(second.trophyAward.id).toBe(first.trophyAward.id);

    const rows = await db.select().from(trophyAwards);
    expect(rows).toHaveLength(1);
  });

  it('leaves no orphaned history row behind when the re-award conflicts', async () => {
    const data = {
      trophyId: fixtures.playerTrophyId,
      competitionId: fixtures.competitionId,
      teamEraId: fixtures.teamEraId,
      playerId: fixtures.playerId,
    };

    await service.upsert(data);
    await service.upsert(data);

    // The BEFORE INSERT versioning trigger fires for the losing insert too;
    // because the statement raises the unique violation itself, Postgres rolls
    // the trigger's write back with it. A history row surviving here would be
    // the #711 failure: its deferred FK back to trophy_awards.id would have
    // nothing to point at.
    const history = await db.select().from(trophyAwardsHistory);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe((await db.select().from(trophyAwards))[0].id);
  });

  it('dedups a team award, whose playerId is null, via NULLS NOT DISTINCT', async () => {
    const data = {
      trophyId: fixtures.teamTrophyId,
      competitionId: fixtures.competitionId,
      teamEraId: fixtures.teamEraId,
      playerId: null,
    };

    const first = await service.upsert(data);
    const second = await service.upsert(data);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.trophyAward.id).toBe(first.trophyAward.id);
    expect(await db.select().from(trophyAwards)).toHaveLength(1);
  });
});
