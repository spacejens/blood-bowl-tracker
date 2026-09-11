import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionGroups,
  competitions,
  DB,
  eras,
  leagues,
  matches,
  matchEvents,
  matchTeams,
  players,
  positions,
  races,
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

import { MatchScopeFilterService } from '../src/shared/match-scope-filter.service';
import { CareerThresholdTrophyRuleService } from '../src/trophy-awards/threshold-trophy-rule.service';
import { TrophyRuleEventTypeFilterService } from '../src/trophy-awards/trophy-rule-event-type-filter.service';
import { TrophyRulePositionFilterService } from '../src/trophy-awards/trophy-rule-position-filter.service';
import { connectTestDb } from './e2e-database';

/**
 * Which competition a lifetime trophy is recorded against is a question about
 * real match chronology and a running cumulative total — a window function the
 * mocked db in the unit spec cannot execute. So the attribution rules live
 * here, against real Postgres, seeded so that the competition a player crosses
 * their threshold in is deliberately NOT the first one the test happens to ask
 * about.
 */

const SPP_THRESHOLD = 10;
const CASUALTY_THRESHOLD = 3;

interface LeagueFixtures {
  leagueId: number;
  teamEraId: number;
  positionId: number;
  starPositionId: number;
  competitionA: number;
  competitionB: number;
  sppTrophyId: number;
  casualtyTrophyId: number;
}

interface SeededMatch {
  matchId: number;
  matchTeamId: number;
}

/** Both competitions, both trophies and one team, inserted in foreign-key order. */
async function seedLeague(db: Db): Promise<LeagueFixtures> {
  const [league] = await db
    .insert(leagues)
    .values({ name: 'Career League' })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({
      name: 'Career Era',
      leagueId: league.id,
      startDate: '2020-01-01',
    })
    .returning();
  const [coach] = await db
    .insert(coaches)
    .values({ name: 'Career Coach' })
    .returning();
  const [race] = await db
    .insert(races)
    .values({ name: 'Career Race' })
    .returning();
  const [team] = await db
    .insert(teams)
    .values({ name: 'Career Team', raceId: race.id, coachId: coach.id })
    .returning();
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId: team.id, eraId: era.id })
    .returning();
  const [group] = await db
    .insert(competitionGroups)
    .values({ name: 'Seasons', leagueId: league.id })
    .returning();
  const [first] = await db
    .insert(competitions)
    .values({
      name: 'Season 1',
      type: 'season',
      eraId: era.id,
      competitionGroupId: group.id,
      startDate: '2020-01-01',
    })
    .returning();
  const [second] = await db
    .insert(competitions)
    .values({
      name: 'Season 2',
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
  const [starPosition] = await db
    .insert(positions)
    .values({ name: 'Griff Oberwald', isStarPlayer: true })
    .returning();
  const [sppTrophy] = await db
    .insert(trophies)
    .values({
      name: 'Legendary Player',
      recipientKind: 'player',
      competitionGroupId: null,
      leagueId: league.id,
      awardRuleKind: 'career_threshold',
      // Stated because the column carries a temporary non-null default for
      // rolling deployments, which a computed kind must not pick up.
      awardProcedure: null,
      awardRuleRole: 'acting',
      awardRuleThreshold: SPP_THRESHOLD,
      awardRuleMeasure: 'spp_sum',
    })
    .returning();
  const [casualtyTrophy] = await db
    .insert(trophies)
    .values({
      name: 'Long Service',
      recipientKind: 'player',
      competitionGroupId: null,
      leagueId: league.id,
      awardRuleKind: 'career_threshold',
      awardProcedure: null,
      awardRuleRole: 'consequence',
      awardRuleThreshold: CASUALTY_THRESHOLD,
      awardRuleMeasure: 'event_count',
    })
    .returning();

  return {
    leagueId: league.id,
    teamEraId: teamEra.id,
    positionId: position.id,
    starPositionId: starPosition.id,
    competitionA: first.id,
    competitionB: second.id,
    sppTrophyId: sppTrophy.id,
    casualtyTrophyId: casualtyTrophy.id,
  };
}

async function addPlayer(
  db: Db,
  fixtures: LeagueFixtures,
  overrides: { name: string; sppAdjustment?: number; star?: boolean },
): Promise<number> {
  const [player] = await db
    .insert(players)
    .values({
      name: overrides.name,
      teamEraId: fixtures.teamEraId,
      positionId:
        overrides.star === true ? fixtures.starPositionId : fixtures.positionId,
      sppAdjustment: overrides.sppAdjustment ?? 0,
    })
    .returning();
  return player.id;
}

async function addMatch(
  db: Db,
  fixtures: LeagueFixtures,
  when: { competitionId: number; playedAt: string },
): Promise<SeededMatch> {
  const [match] = await db
    .insert(matches)
    .values({
      competitionId: when.competitionId,
      playedAt: new Date(when.playedAt),
      name: `Match ${when.playedAt}`,
      category: 'normal',
    })
    .returning();
  const [matchTeam] = await db
    .insert(matchTeams)
    .values({ matchId: match.id, teamEraId: fixtures.teamEraId })
    .returning();
  return { matchId: match.id, matchTeamId: matchTeam.id };
}

/** One SPP-carrying touchdown by `playerId` in `match`. */
async function addSppEvent(
  db: Db,
  match: SeededMatch,
  event: { playerId: number; sppValue: number },
): Promise<void> {
  await db.insert(matchEvents).values({
    matchId: match.matchId,
    actingMatchTeamId: match.matchTeamId,
    actingPlayerId: event.playerId,
    actionType: 'touchdown',
    sppValue: event.sppValue,
  });
}

/** One casualty suffered by `playerId` in `match` — the `event_count` shape. */
async function addCasualtyEvent(
  db: Db,
  match: SeededMatch,
  event: { playerId: number },
): Promise<void> {
  await db.insert(matchEvents).values({
    matchId: match.matchId,
    consequenceMatchTeamId: match.matchTeamId,
    consequencePlayerId: event.playerId,
    consequenceType: 'casualty',
  });
}

describe('CareerThresholdTrophyRuleService (real Postgres)', () => {
  let db: Db;
  let service: CareerThresholdTrophyRuleService;
  let fixtures: LeagueFixtures;

  const sppOptions = (competitionId: number) =>
    ({
      trophyId: fixtures.sppTrophyId,
      competitionId,
      leagueId: fixtures.leagueId,
      role: 'acting',
      types: { actionTypes: [], consequenceTypes: [] },
      eligiblePositionIds: undefined,
      threshold: SPP_THRESHOLD,
      measure: 'spp_sum',
    }) as const;

  const casualtyOptions = (competitionId: number) =>
    ({
      trophyId: fixtures.casualtyTrophyId,
      competitionId,
      leagueId: fixtures.leagueId,
      role: 'consequence',
      types: { actionTypes: [], consequenceTypes: ['casualty'] },
      eligiblePositionIds: undefined,
      threshold: CASUALTY_THRESHOLD,
      measure: 'event_count',
    }) as const;

  const winnerIds = async (
    options: ReturnType<typeof sppOptions> | ReturnType<typeof casualtyOptions>,
  ): Promise<number[]> =>
    (await service.compute(options)).map((winner) => winner.playerId);

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    fixtures = await seedLeague(db);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CareerThresholdTrophyRuleService,
        TrophyRuleEventTypeFilterService,
        TrophyRulePositionFilterService,
        MatchScopeFilterService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CareerThresholdTrophyRuleService);
  });

  it('awards the competition whose match pushed the player over, not a later one', async () => {
    const player = await addPlayer(db, fixtures, { name: 'Early Crosser' });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    const alsoJanuary = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-20T12:00:00Z',
    });
    const february = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionB,
      playedAt: '2020-02-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: player, sppValue: 6 });
    await addSppEvent(db, alsoJanuary, { playerId: player, sppValue: 6 });
    await addSppEvent(db, february, { playerId: player, sppValue: 6 });

    expect(await winnerIds(sppOptions(fixtures.competitionA))).toEqual([
      player,
    ]);
    expect(await winnerIds(sppOptions(fixtures.competitionB))).toEqual([]);
  });

  it('attributes a later crossing to the later competition even when the earlier one is asked first', async () => {
    // Seeded so the old "whichever competition is processed first wins" rule
    // would hand this trophy to competition A: the player plays there, but
    // only reaches the threshold in B.
    const player = await addPlayer(db, fixtures, { name: 'Late Crosser' });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    const february = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionB,
      playedAt: '2020-02-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: player, sppValue: 6 });
    await addSppEvent(db, february, { playerId: player, sppValue: 6 });

    expect(await winnerIds(sppOptions(fixtures.competitionA))).toEqual([]);
    expect(await winnerIds(sppOptions(fixtures.competitionB))).toEqual([
      player,
    ]);
  });

  it('gives the same answer whichever competition is computed first', async () => {
    const player = await addPlayer(db, fixtures, { name: 'Late Crosser' });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    const february = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionB,
      playedAt: '2020-02-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: player, sppValue: 6 });
    await addSppEvent(db, february, { playerId: player, sppValue: 6 });

    // Reverse call order of the previous test; the answer must not move.
    expect(await winnerIds(sppOptions(fixtures.competitionB))).toEqual([
      player,
    ]);
    expect(await winnerIds(sppOptions(fixtures.competitionA))).toEqual([]);
  });

  it('never awards a player whose league total stays under the threshold', async () => {
    const player = await addPlayer(db, fixtures, { name: 'Journeyman' });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: player, sppValue: 9 });

    expect(await winnerIds(sppOptions(fixtures.competitionA))).toEqual([]);
    expect(await winnerIds(sppOptions(fixtures.competitionB))).toEqual([]);
  });

  it('banks spp_adjustment before the first match event, so an adjusted player crosses sooner', async () => {
    const adjusted = await addPlayer(db, fixtures, {
      name: 'Adjusted',
      sppAdjustment: 8,
    });
    const plain = await addPlayer(db, fixtures, {
      name: 'Unadjusted',
      sppAdjustment: 0,
    });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    const february = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionB,
      playedAt: '2020-02-10T12:00:00Z',
    });
    for (const playerId of [adjusted, plain]) {
      await addSppEvent(db, january, { playerId, sppValue: 3 });
      await addSppEvent(db, february, { playerId, sppValue: 8 });
    }

    // 8 banked + 3 = 11 in January; the unadjusted player only reaches 11 in
    // February.
    expect(await winnerIds(sppOptions(fixtures.competitionA))).toEqual([
      adjusted,
    ]);
    expect(await winnerIds(sppOptions(fixtures.competitionB))).toEqual([plain]);
  });

  it('never awards a player whose adjustment alone clears the threshold with no match events', async () => {
    await addPlayer(db, fixtures, {
      name: 'Paper Legend',
      sppAdjustment: SPP_THRESHOLD + 5,
    });
    // Another player's match exists, so the query is not trivially empty.
    const other = await addPlayer(db, fixtures, { name: 'Other' });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: other, sppValue: 1 });

    expect(await winnerIds(sppOptions(fixtures.competitionA))).toEqual([]);
    expect(await winnerIds(sppOptions(fixtures.competitionB))).toEqual([]);
  });

  it('ignores spp_adjustment entirely for an event_count measure', async () => {
    const player = await addPlayer(db, fixtures, {
      name: 'Battered',
      sppAdjustment: 999,
    });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    const alsoJanuary = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-20T12:00:00Z',
    });
    const february = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionB,
      playedAt: '2020-02-10T12:00:00Z',
    });
    await addCasualtyEvent(db, january, { playerId: player });
    await addCasualtyEvent(db, alsoJanuary, { playerId: player });
    await addCasualtyEvent(db, february, { playerId: player });

    // A banked 999 would have crossed at the very first casualty, in A.
    expect(await winnerIds(casualtyOptions(fixtures.competitionA))).toEqual([]);
    expect(await winnerIds(casualtyOptions(fixtures.competitionB))).toEqual([
      player,
    ]);
  });

  it('drops a player who already holds this trophy', async () => {
    const player = await addPlayer(db, fixtures, { name: 'Repeat Winner' });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: player, sppValue: 20 });
    await db.insert(trophyAwards).values({
      trophyId: fixtures.sppTrophyId,
      competitionId: fixtures.competitionB,
      teamEraId: fixtures.teamEraId,
      playerId: player,
    });

    expect(await winnerIds(sppOptions(fixtures.competitionA))).toEqual([]);
  });

  it('never awards a star player', async () => {
    const player = await addPlayer(db, fixtures, {
      name: 'Griff',
      star: true,
    });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: player, sppValue: 20 });

    expect(await winnerIds(sppOptions(fixtures.competitionA))).toEqual([]);
  });

  it('awards every player who crossed in the same competition', async () => {
    const first = await addPlayer(db, fixtures, { name: 'First' });
    const second = await addPlayer(db, fixtures, { name: 'Second' });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: first, sppValue: 20 });
    await addSppEvent(db, january, { playerId: second, sppValue: 20 });

    expect(
      (await winnerIds(sppOptions(fixtures.competitionA))).toSorted(
        (a, b) => a - b,
      ),
    ).toEqual([first, second]);
  });

  it('returns the team era the winning player belongs to', async () => {
    const player = await addPlayer(db, fixtures, { name: 'Winner' });
    const january = await addMatch(db, fixtures, {
      competitionId: fixtures.competitionA,
      playedAt: '2020-01-10T12:00:00Z',
    });
    await addSppEvent(db, january, { playerId: player, sppValue: 20 });

    expect(await service.compute(sppOptions(fixtures.competitionA))).toEqual([
      { playerId: player, teamEraId: fixtures.teamEraId },
    ]);
  });
});
