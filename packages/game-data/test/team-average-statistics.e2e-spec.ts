import 'reflect-metadata';

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
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import type {
  ActionType,
  ConsequenceType,
  MatchCategory,
} from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FactScope } from '../src/shared/fact-scope';
import { FACT_SCOPE_ALL_TIME } from '../src/shared/fact-scope';
import type { TeamAverageRow } from '../src/teams/team-average-statistics.service';
import { TeamAverageStatisticsService } from '../src/teams/team-average-statistics.service';
import { connectTestDb } from './e2e-database';

interface LeagueFixture {
  leagueId: number;
  eraId: number;
  competitionId: number;
}

/**
 * One event recorded on a side: an action it took (`actionType`, keyed on the
 * acting side) and/or a consequence (`consequenceType`, keyed on the
 * consequence side). The consequence lands on the recording side unless
 * `victimSide` names another side by its index in `PlayMatchesOptions.sides`,
 * which is how one row records a foul by one side injuring the other.
 */
interface SideEvent {
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
  victimSide?: number;
}

interface MatchSide {
  teamEraId: number;
  score: number;
  /** Events recorded on this side in every one of the matches. */
  events?: SideEvent[];
}

interface PlayMatchesOptions {
  count: number;
  competitionId: number;
  category?: MatchCategory;
  sides: MatchSide[];
}

/** One league with one era and one season competition in it. */
async function seedLeague(db: Db, suffix: string): Promise<LeagueFixture> {
  const [league] = await db
    .insert(leagues)
    .values({ name: `League ${suffix}` })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({
      name: `Era ${suffix}`,
      leagueId: league.id,
      startDate: '2020-01-01',
    })
    .returning();
  const [group] = await db
    .insert(competitionGroups)
    .values({
      name: `Season ${suffix}`,
      leagueId: league.id,
      namePattern: `^Season ${suffix}\\s*\\d+$`,
    })
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({
      name: `Season ${suffix} 1`,
      type: 'season',
      eraId: era.id,
      competitionGroupId: group.id,
      startDate: '2020-02-01',
    })
    .returning();
  return {
    leagueId: league.id,
    eraId: era.id,
    competitionId: competition.id,
  };
}

/** A team with its own race and coach; returns the team id. */
async function seedTeam(db: Db, name: string): Promise<number> {
  const [race] = await db
    .insert(races)
    .values({ name: `${name} Race` })
    .returning();
  const [coach] = await db
    .insert(coaches)
    .values({ name: `${name} Coach` })
    .returning();
  const [team] = await db
    .insert(teams)
    .values({ name, raceId: race.id, coachId: coach.id })
    .returning();
  return team.id;
}

/** Enter a team into an era; returns the team era id. */
async function joinEra(db: Db, teamId: number, eraId: number): Promise<number> {
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId, eraId })
    .returning();
  return teamEra.id;
}

/** Record `count` identical matches between the given sides. */
async function playMatches(db: Db, options: PlayMatchesOptions): Promise<void> {
  for (let i = 0; i < options.count; i += 1) {
    const [match] = await db
      .insert(matches)
      .values({
        competitionId: options.competitionId,
        playedAt: new Date(Date.UTC(2020, 2, 1 + i, 12)),
        name: `Match ${i + 1}`,
        category: options.category ?? 'normal',
      })
      .returning();
    const matchTeamIds: number[] = [];
    for (const { teamEraId, score } of options.sides) {
      const [matchTeam] = await db
        .insert(matchTeams)
        .values({ matchId: match.id, teamEraId, score })
        .returning();
      matchTeamIds.push(matchTeam.id);
    }
    const events = options.sides.flatMap(({ events: sideEvents = [] }, index) =>
      sideEvents.map((event) => ({
        matchId: match.id,
        actingMatchTeamId:
          event.actionType === undefined ? undefined : matchTeamIds[index],
        actionType: event.actionType,
        consequenceMatchTeamId:
          event.consequenceType === undefined
            ? undefined
            : matchTeamIds[event.victimSide ?? index],
        consequenceType: event.consequenceType,
      })),
    );
    if (events.length > 0) {
      await db.insert(matchEvents).values(events);
    }
  }
}

function namesAndAverages(rows: TeamAverageRow[]): [string, number][] {
  return rows.map((row) => [row.name, row.average]);
}

describe('TeamAverageStatisticsService (real Postgres)', () => {
  let db: Db;
  let service: TeamAverageStatisticsService;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    // Same Test.createTestingModule shape as the unit specs; DB is a real
    // migrated database instead of mockDb(), which is the point of an e2e spec.
    const moduleRef = await Test.createTestingModule({
      providers: [TeamAverageStatisticsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(TeamAverageStatisticsService);
  });

  it('ranks a team with five matches and leaves out one with four', async () => {
    const league = await seedLeague(db, 'One');
    const fiveId = await seedTeam(db, 'Five Matches');
    const five = await joinEra(db, fiveId, league.eraId);
    const four = await joinEra(
      db,
      await seedTeam(db, 'Four Matches'),
      league.eraId,
    );
    const once = await joinEra(
      db,
      await seedTeam(db, 'One Match'),
      league.eraId,
    );
    await playMatches(db, {
      count: 4,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: five, score: 1 },
        { teamEraId: four, score: 3 },
      ],
    });
    await playMatches(db, {
      count: 1,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: five, score: 2 },
        { teamEraId: once, score: 0 },
      ],
    });

    await expect(
      service.averageTouchdownsScoredByTeam(FACT_SCOPE_ALL_TIME, 'desc', 10),
    ).resolves.toEqual([
      { teamId: fiveId, name: 'Five Matches', average: 1.2 },
    ]);
  });

  describe('a four-team merged final played five times', () => {
    beforeEach(async () => {
      const league = await seedLeague(db, 'One');
      const sides: MatchSide[] = [];
      // Charlie is seeded before Bravo so ids run opposite to name order and
      // only an explicit name tie-break produces the expected ordering.
      for (const [name, score] of [
        ['Alpha', 3],
        ['Charlie', 1],
        ['Bravo', 1],
        ['Delta', 0],
      ] as const) {
        const teamEraId = await joinEra(
          db,
          await seedTeam(db, name),
          league.eraId,
        );
        sides.push({ teamEraId, score });
      }
      await playMatches(db, {
        count: 5,
        competitionId: league.competitionId,
        category: 'season_final',
        sides,
      });
    });

    it('ranks touchdowns scored highest first, ties by name', async () => {
      expect(
        namesAndAverages(
          await service.averageTouchdownsScoredByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Alpha', 3],
        ['Bravo', 1],
        ['Charlie', 1],
        ['Delta', 0],
      ]);
    });

    it('ranks touchdowns scored lowest first, ties by name', async () => {
      expect(
        namesAndAverages(
          await service.averageTouchdownsScoredByTeam(
            FACT_SCOPE_ALL_TIME,
            'asc',
            10,
          ),
        ),
      ).toEqual([
        ['Delta', 0],
        ['Bravo', 1],
        ['Charlie', 1],
        ['Alpha', 3],
      ]);
    });

    it('counts every other side as conceded, highest first', async () => {
      expect(
        namesAndAverages(
          await service.averageTouchdownsConcededByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Delta', 5],
        ['Bravo', 4],
        ['Charlie', 4],
        ['Alpha', 2],
      ]);
    });

    it('ranks touchdowns conceded lowest first and honours the limit', async () => {
      expect(
        namesAndAverages(
          await service.averageTouchdownsConcededByTeam(
            FACT_SCOPE_ALL_TIME,
            'asc',
            2,
          ),
        ),
      ).toEqual([
        ['Alpha', 2],
        ['Bravo', 4],
      ]);
    });
  });

  describe('casualty and injury averages', () => {
    // Alpha inflicts and Bravo suffers in five matches; Alpha also plays five
    // event-free matches against Charlie, which still count as matches.
    // Charlie is seeded before Bravo so ids run opposite to name order and
    // only the name tie-break orders their equal averages.
    beforeEach(async () => {
      const league = await seedLeague(db, 'One');
      const alpha = await joinEra(
        db,
        await seedTeam(db, 'Alpha'),
        league.eraId,
      );
      const charlie = await joinEra(
        db,
        await seedTeam(db, 'Charlie'),
        league.eraId,
      );
      const bravo = await joinEra(
        db,
        await seedTeam(db, 'Bravo'),
        league.eraId,
      );
      await playMatches(db, {
        count: 5,
        competitionId: league.competitionId,
        sides: [
          {
            teamEraId: alpha,
            score: 1,
            events: [
              { actionType: 'badly_hurt' },
              { actionType: 'serious_injury' },
              // Not a casualty caused, even when the foul injures.
              { actionType: 'foul' },
              { actionType: 'touchdown' },
            ],
          },
          {
            teamEraId: bravo,
            score: 0,
            events: [
              { consequenceType: 'badly_hurt' },
              { consequenceType: 'serious_injury' },
              { consequenceType: 'niggling_injury' },
              // Not a casualty suffered.
              { consequenceType: 'sent_off' },
            ],
          },
        ],
      });
      await playMatches(db, {
        count: 5,
        competitionId: league.competitionId,
        sides: [
          { teamEraId: alpha, score: 0 },
          { teamEraId: charlie, score: 0 },
        ],
      });
    });

    it('averages casualties caused over every match, highest first', async () => {
      expect(
        namesAndAverages(
          await service.averageCasualtiesCausedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Alpha', 1],
        ['Bravo', 0],
        ['Charlie', 0],
      ]);
    });

    it('ranks casualties caused lowest first, ties by name', async () => {
      expect(
        namesAndAverages(
          await service.averageCasualtiesCausedByTeam(
            FACT_SCOPE_ALL_TIME,
            'asc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo', 0],
        ['Charlie', 0],
        ['Alpha', 1],
      ]);
    });

    it('averages serious injuries caused', async () => {
      expect(
        namesAndAverages(
          await service.averageSeriousInjuriesCausedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Alpha', 0.5],
        ['Bravo', 0],
        ['Charlie', 0],
      ]);
    });

    it('averages casualties suffered on the victim side', async () => {
      expect(
        namesAndAverages(
          await service.averageCasualtiesSufferedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo', 3],
        ['Alpha', 0],
        ['Charlie', 0],
      ]);
    });

    it('averages serious injuries suffered', async () => {
      expect(
        namesAndAverages(
          await service.averageSeriousInjuriesSufferedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo', 2],
        ['Alpha', 0],
        ['Charlie', 0],
      ]);
    });

    it('averages lasting injuries suffered', async () => {
      expect(
        namesAndAverages(
          await service.averageLastingInjuriesSufferedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo', 1],
        ['Alpha', 0],
        ['Charlie', 0],
      ]);
    });

    it('ranks lasting injuries suffered lowest first and honours the limit', async () => {
      expect(
        namesAndAverages(
          await service.averageLastingInjuriesSufferedByTeam(
            FACT_SCOPE_ALL_TIME,
            'asc',
            2,
          ),
        ),
      ).toEqual([
        ['Alpha', 0],
        ['Charlie', 0],
      ]);
    });
  });

  describe('a foul that injures, recorded as one combined row', () => {
    // Fouler's foul seriously injures one of Victim's players in each of five
    // matches: one row with the fouler acting and the victim suffering.
    beforeEach(async () => {
      const league = await seedLeague(db, 'One');
      const fouler = await joinEra(
        db,
        await seedTeam(db, 'Fouler'),
        league.eraId,
      );
      const victim = await joinEra(
        db,
        await seedTeam(db, 'Victim'),
        league.eraId,
      );
      await playMatches(db, {
        count: 5,
        competitionId: league.competitionId,
        sides: [
          {
            teamEraId: fouler,
            score: 0,
            events: [
              {
                actionType: 'foul',
                consequenceType: 'serious_injury',
                victimSide: 1,
              },
            ],
          },
          { teamEraId: victim, score: 0 },
        ],
      });
    });

    it('counts as a casualty and serious injury suffered by the victim', async () => {
      expect(
        namesAndAverages(
          await service.averageCasualtiesSufferedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Victim', 1],
        ['Fouler', 0],
      ]);
      expect(
        namesAndAverages(
          await service.averageSeriousInjuriesSufferedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Victim', 1],
        ['Fouler', 0],
      ]);
    });

    it('does not count as a casualty or serious injury caused by the fouler', async () => {
      expect(
        namesAndAverages(
          await service.averageCasualtiesCausedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Fouler', 0],
        ['Victim', 0],
      ]);
      expect(
        namesAndAverages(
          await service.averageSeriousInjuriesCausedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Fouler', 0],
        ['Victim', 0],
      ]);
    });
  });

  describe('death averages', () => {
    // Alpha kills once per match against Bravo in five matches, and its foul
    // also kills one of Bravo's players in each (one combined row: a death
    // suffered by Bravo but not a death caused by Alpha). Bravo also records
    // one death of its own per match. Alpha plays five death-free matches
    // against Charlie, which still count as matches. Charlie is seeded
    // before Bravo so ids run opposite to name order and only the name
    // tie-break orders their equal averages.
    beforeEach(async () => {
      const league = await seedLeague(db, 'One');
      const alpha = await joinEra(
        db,
        await seedTeam(db, 'Alpha'),
        league.eraId,
      );
      const charlie = await joinEra(
        db,
        await seedTeam(db, 'Charlie'),
        league.eraId,
      );
      const bravo = await joinEra(
        db,
        await seedTeam(db, 'Bravo'),
        league.eraId,
      );
      await playMatches(db, {
        count: 5,
        competitionId: league.competitionId,
        sides: [
          {
            teamEraId: alpha,
            score: 1,
            events: [
              { actionType: 'death' },
              // A casualty, but not a death caused.
              { actionType: 'badly_hurt' },
              { actionType: 'foul', consequenceType: 'death', victimSide: 1 },
            ],
          },
          {
            teamEraId: bravo,
            score: 0,
            events: [
              { consequenceType: 'death' },
              // A casualty, but not a death suffered.
              { consequenceType: 'serious_injury' },
            ],
          },
        ],
      });
      await playMatches(db, {
        count: 5,
        competitionId: league.competitionId,
        sides: [
          { teamEraId: alpha, score: 0 },
          { teamEraId: charlie, score: 0 },
        ],
      });
    });

    it('averages deaths caused over every match, highest first', async () => {
      expect(
        namesAndAverages(
          await service.averageDeathsCausedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Alpha', 0.5],
        ['Bravo', 0],
        ['Charlie', 0],
      ]);
    });

    it('ranks deaths caused lowest first, ties by name', async () => {
      expect(
        namesAndAverages(
          await service.averageDeathsCausedByTeam(
            FACT_SCOPE_ALL_TIME,
            'asc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo', 0],
        ['Charlie', 0],
        ['Alpha', 0.5],
      ]);
    });

    it('averages deaths suffered on the victim side, fouls included', async () => {
      expect(
        namesAndAverages(
          await service.averageDeathsSufferedByTeam(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo', 2],
        ['Alpha', 0],
        ['Charlie', 0],
      ]);
    });

    it('ranks deaths suffered lowest first and honours the limit', async () => {
      expect(
        namesAndAverages(
          await service.averageDeathsSufferedByTeam(
            FACT_SCOPE_ALL_TIME,
            'asc',
            2,
          ),
        ),
      ).toEqual([
        ['Alpha', 0],
        ['Charlie', 0],
      ]);
    });
  });

  it('rounds the average to two decimals and returns it as a number', async () => {
    const league = await seedLeague(db, 'One');
    const x = await joinEra(db, await seedTeam(db, 'X Team'), league.eraId);
    const y = await joinEra(db, await seedTeam(db, 'Y Team'), league.eraId);
    await playMatches(db, {
      count: 1,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: x, score: 2 },
        { teamEraId: y, score: 0 },
      ],
    });
    await playMatches(db, {
      count: 5,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: x, score: 1 },
        { teamEraId: y, score: 0 },
      ],
    });

    const [top] = await service.averageTouchdownsScoredByTeam(
      FACT_SCOPE_ALL_TIME,
      'desc',
      10,
    );
    expect(top.name).toBe('X Team');
    expect(top.average).toBe(1.17);
    expect(typeof top.average).toBe('number');
  });

  describe('scopes', () => {
    let first: LeagueFixture;
    let second: LeagueFixture;

    beforeEach(async () => {
      first = await seedLeague(db, 'One');
      second = await seedLeague(db, 'Two');
      const pId = await seedTeam(db, 'P Team');
      const qId = await seedTeam(db, 'Q Team');
      await playMatches(db, {
        count: 5,
        competitionId: first.competitionId,
        sides: [
          { teamEraId: await joinEra(db, pId, first.eraId), score: 1 },
          { teamEraId: await joinEra(db, qId, first.eraId), score: 0 },
        ],
      });
      await playMatches(db, {
        count: 5,
        competitionId: second.competitionId,
        category: 'season_final',
        sides: [
          { teamEraId: await joinEra(db, pId, second.eraId), score: 3 },
          { teamEraId: await joinEra(db, qId, second.eraId), score: 0 },
        ],
      });
    });

    async function topAverage(scope: FactScope): Promise<number> {
      const [top] = await service.averageTouchdownsScoredByTeam(
        scope,
        'desc',
        1,
      );
      expect(top.name).toBe('P Team');
      return top.average;
    }

    it('averages across every era all-time', async () => {
      expect(await topAverage(FACT_SCOPE_ALL_TIME)).toBe(2);
    });

    it('narrows to one era', async () => {
      expect(await topAverage({ eraId: first.eraId })).toBe(1);
      expect(await topAverage({ eraId: second.eraId })).toBe(3);
    });

    it('narrows to one league', async () => {
      expect(await topAverage({ leagueId: second.leagueId })).toBe(3);
    });

    it('narrows to one match category', async () => {
      expect(await topAverage({ category: 'season_final' })).toBe(3);
    });

    it('ignores a competition scope', async () => {
      expect(await topAverage({ competitionId: first.competitionId })).toBe(2);
    });
  });
});
