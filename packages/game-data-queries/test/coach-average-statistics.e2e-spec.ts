import 'reflect-metadata';

import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CoachAverageRow } from '../src/coaches/coach-average-statistics.service';
import { CoachAverageStatisticsService } from '../src/coaches/coach-average-statistics.service';
import { PerMatchAverageSqlService } from '../src/shared/per-match-average-sql.service';
import { connectTestDb } from './e2e-database';
import type { LeagueFixture, MatchSide } from './match-fixtures';
import {
  joinEra,
  playMatches,
  seedCoach,
  seedLeague,
  seedTeam,
} from './match-fixtures';

function namesAndAverages(rows: CoachAverageRow[]): [string, number][] {
  return rows.map((row) => [row.name, row.average]);
}

describe('CoachAverageStatisticsService (real Postgres)', () => {
  let db: Db;
  let service: CoachAverageStatisticsService;

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
        CoachAverageStatisticsService,
        PerMatchAverageSqlService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CoachAverageStatisticsService);
  });

  it('spans all of a coach’s teams and needs five matches across them', async () => {
    const league = await seedLeague(db, 'One');
    const fiveCoachId = await seedCoach(db, 'Five Coach');
    const fiveA = await joinEra(
      db,
      await seedTeam(db, 'Five A', fiveCoachId),
      league.eraId,
    );
    const fiveB = await joinEra(
      db,
      await seedTeam(db, 'Five B', fiveCoachId),
      league.eraId,
    );
    // Four Coach plays four matches, Lone Coach one: both below the floor.
    const four = await joinEra(db, await seedTeam(db, 'Four'), league.eraId);
    const lone = await joinEra(db, await seedTeam(db, 'Lone'), league.eraId);
    await playMatches(db, {
      count: 3,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: fiveA, score: 0, events: [{ actionType: 'badly_hurt' }] },
        { teamEraId: four, score: 0 },
      ],
    });
    await playMatches(db, {
      count: 1,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: fiveB, score: 0 },
        { teamEraId: four, score: 0 },
      ],
    });
    await playMatches(db, {
      count: 1,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: fiveB, score: 0 },
        { teamEraId: lone, score: 0 },
      ],
    });

    await expect(
      service.averageCasualtiesCausedByCoach(FACT_SCOPE_ALL_TIME, 'desc', 10),
    ).resolves.toEqual([
      { coachId: fiveCoachId, name: 'Five Coach', average: 0.6 },
    ]);
  });

  it('counts a match between two of the coach’s own teams once, with both sides’ events', async () => {
    const league = await seedLeague(db, 'One');
    const derbyCoachId = await seedCoach(db, 'Derby Coach');
    const home = await joinEra(
      db,
      await seedTeam(db, 'Derby Home', derbyCoachId),
      league.eraId,
    );
    const away = await joinEra(
      db,
      await seedTeam(db, 'Derby Away', derbyCoachId),
      league.eraId,
    );
    await playMatches(db, {
      count: 5,
      competitionId: league.competitionId,
      sides: [
        {
          teamEraId: home,
          score: 0,
          events: [
            {
              actionType: 'badly_hurt',
              consequenceType: 'badly_hurt',
              victimSide: 1,
            },
          ],
        },
        {
          teamEraId: away,
          score: 0,
          events: [
            {
              actionType: 'serious_injury',
              consequenceType: 'serious_injury',
              victimSide: 0,
            },
          ],
        },
      ],
    });

    // 10 casualties caused (5 per side) over 5 distinct matches, not 10.
    expect(
      namesAndAverages(
        await service.averageCasualtiesCausedByCoach(
          FACT_SCOPE_ALL_TIME,
          'desc',
          10,
        ),
      ),
    ).toEqual([['Derby Coach', 2]]);
    expect(
      namesAndAverages(
        await service.averageCasualtiesSufferedByCoach(
          FACT_SCOPE_ALL_TIME,
          'desc',
          10,
        ),
      ),
    ).toEqual([['Derby Coach', 2]]);
    expect(
      namesAndAverages(
        await service.averageSeriousInjuriesCausedByCoach(
          FACT_SCOPE_ALL_TIME,
          'desc',
          10,
        ),
      ),
    ).toEqual([['Derby Coach', 1]]);
  });

  it('spans all of a coach’s teams for touchdowns scored and conceded', async () => {
    const league = await seedLeague(db, 'One');
    const fiveCoachId = await seedCoach(db, 'Five Coach');
    const fiveA = await joinEra(
      db,
      await seedTeam(db, 'Five A', fiveCoachId),
      league.eraId,
    );
    const fiveB = await joinEra(
      db,
      await seedTeam(db, 'Five B', fiveCoachId),
      league.eraId,
    );
    // Four Coach plays four matches, Lone Coach one: both below the floor.
    const four = await joinEra(db, await seedTeam(db, 'Four'), league.eraId);
    const lone = await joinEra(db, await seedTeam(db, 'Lone'), league.eraId);
    await playMatches(db, {
      count: 3,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: fiveA, score: 2 },
        { teamEraId: four, score: 0 },
      ],
    });
    await playMatches(db, {
      count: 1,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: fiveB, score: 1 },
        { teamEraId: four, score: 1 },
      ],
    });
    await playMatches(db, {
      count: 1,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: fiveB, score: 0 },
        { teamEraId: lone, score: 3 },
      ],
    });

    // Scored 2+2+2+1+0 = 7 and conceded 0+0+0+1+3 = 4 over 5 matches.
    await expect(
      service.averageTouchdownsScoredByCoach(FACT_SCOPE_ALL_TIME, 'desc', 10),
    ).resolves.toEqual([
      { coachId: fiveCoachId, name: 'Five Coach', average: 1.4 },
    ]);
    expect(
      namesAndAverages(
        await service.averageTouchdownsConcededByCoach(
          FACT_SCOPE_ALL_TIME,
          'desc',
          10,
        ),
      ),
    ).toEqual([['Five Coach', 0.8]]);
  });

  it('counts a match between two of the coach’s own teams once, with both sides’ touchdowns', async () => {
    const league = await seedLeague(db, 'One');
    const derbyCoachId = await seedCoach(db, 'Derby Coach');
    const home = await joinEra(
      db,
      await seedTeam(db, 'Derby Home', derbyCoachId),
      league.eraId,
    );
    const away = await joinEra(
      db,
      await seedTeam(db, 'Derby Away', derbyCoachId),
      league.eraId,
    );
    await playMatches(db, {
      count: 5,
      competitionId: league.competitionId,
      sides: [
        { teamEraId: home, score: 2 },
        { teamEraId: away, score: 1 },
      ],
    });

    // 15 touchdowns (3 per match) over 5 distinct matches, not 10 sides.
    expect(
      namesAndAverages(
        await service.averageTouchdownsScoredByCoach(
          FACT_SCOPE_ALL_TIME,
          'desc',
          10,
        ),
      ),
    ).toEqual([['Derby Coach', 3]]);
    // Each side concedes the other's score: 1 + 2 per match.
    expect(
      namesAndAverages(
        await service.averageTouchdownsConcededByCoach(
          FACT_SCOPE_ALL_TIME,
          'desc',
          10,
        ),
      ),
    ).toEqual([['Derby Coach', 3]]);
  });

  describe('touchdown averages in a four-team merged final played five times', () => {
    beforeEach(async () => {
      const league = await seedLeague(db, 'One');
      const sides: MatchSide[] = [];
      // Each team gets its own coach, named `<team> Coach`. Charlie is
      // seeded before Bravo so ids run opposite to name order and only the
      // name tie-break orders their equal averages.
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

    it('ranks touchdowns scored highest first, ties by coach name', async () => {
      expect(
        namesAndAverages(
          await service.averageTouchdownsScoredByCoach(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Alpha Coach', 3],
        ['Bravo Coach', 1],
        ['Charlie Coach', 1],
        ['Delta Coach', 0],
      ]);
    });

    it('ranks touchdowns scored lowest first, ties by coach name', async () => {
      expect(
        namesAndAverages(
          await service.averageTouchdownsScoredByCoach(
            FACT_SCOPE_ALL_TIME,
            'asc',
            10,
          ),
        ),
      ).toEqual([
        ['Delta Coach', 0],
        ['Bravo Coach', 1],
        ['Charlie Coach', 1],
        ['Alpha Coach', 3],
      ]);
    });

    it('counts every other side as conceded, highest first', async () => {
      expect(
        namesAndAverages(
          await service.averageTouchdownsConcededByCoach(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Delta Coach', 5],
        ['Bravo Coach', 4],
        ['Charlie Coach', 4],
        ['Alpha Coach', 2],
      ]);
    });

    it('ranks touchdowns conceded lowest first and honours the limit', async () => {
      expect(
        namesAndAverages(
          await service.averageTouchdownsConcededByCoach(
            FACT_SCOPE_ALL_TIME,
            'asc',
            2,
          ),
        ),
      ).toEqual([
        ['Alpha Coach', 2],
        ['Bravo Coach', 4],
      ]);
    });
  });

  describe('casualty averages', () => {
    // Alpha Coach's team inflicts one casualty per match against Bravo's in
    // five matches, and also fouls a Bravo player into a casualty in each
    // (suffered by Bravo, no credit to Alpha). Alpha also plays five
    // event-free matches against Charlie. Charlie is seeded before Bravo so
    // ids run opposite to name order and only the name tie-break orders
    // their equal averages.
    beforeEach(async () => {
      const league = await seedLeague(db, 'One');
      const alpha = await joinEra(
        db,
        await seedTeam(db, 'Alpha', await seedCoach(db, 'Alpha Coach')),
        league.eraId,
      );
      const charlie = await joinEra(
        db,
        await seedTeam(db, 'Charlie', await seedCoach(db, 'Charlie Coach')),
        league.eraId,
      );
      const bravo = await joinEra(
        db,
        await seedTeam(db, 'Bravo', await seedCoach(db, 'Bravo Coach')),
        league.eraId,
      );
      await playMatches(db, {
        count: 5,
        competitionId: league.competitionId,
        sides: [
          {
            teamEraId: alpha,
            score: 0,
            events: [
              { actionType: 'badly_hurt' },
              {
                actionType: 'foul',
                consequenceType: 'badly_hurt',
                victimSide: 1,
              },
            ],
          },
          { teamEraId: bravo, score: 0 },
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

    it('ranks casualties caused highest first, fouls excluded', async () => {
      expect(
        namesAndAverages(
          await service.averageCasualtiesCausedByCoach(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Alpha Coach', 0.5],
        ['Bravo Coach', 0],
        ['Charlie Coach', 0],
      ]);
    });

    it('ranks casualties caused lowest first, ties by coach name', async () => {
      expect(
        namesAndAverages(
          await service.averageCasualtiesCausedByCoach(
            FACT_SCOPE_ALL_TIME,
            'asc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo Coach', 0],
        ['Charlie Coach', 0],
        ['Alpha Coach', 0.5],
      ]);
    });

    it('counts the foul casualty as suffered by the victim’s coach', async () => {
      expect(
        namesAndAverages(
          await service.averageCasualtiesSufferedByCoach(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo Coach', 1],
        ['Alpha Coach', 0],
        ['Charlie Coach', 0],
      ]);
    });
  });

  describe('lasting injury and death averages', () => {
    // In each of five matches Alpha's team inflicts a casualty that leaves a
    // niggling injury and kills a Bravo player.
    beforeEach(async () => {
      const league = await seedLeague(db, 'One');
      const alpha = await joinEra(
        db,
        await seedTeam(db, 'Alpha', await seedCoach(db, 'Alpha Coach')),
        league.eraId,
      );
      const bravo = await joinEra(
        db,
        await seedTeam(db, 'Bravo', await seedCoach(db, 'Bravo Coach')),
        league.eraId,
      );
      await playMatches(db, {
        count: 5,
        competitionId: league.competitionId,
        sides: [
          {
            teamEraId: alpha,
            score: 0,
            events: [
              {
                actionType: 'serious_injury',
                consequenceType: 'niggling_injury',
                victimSide: 1,
              },
              { actionType: 'death', consequenceType: 'death', victimSide: 1 },
            ],
          },
          { teamEraId: bravo, score: 0 },
        ],
      });
    });

    it('averages lasting injuries caused and suffered', async () => {
      expect(
        namesAndAverages(
          await service.averageLastingInjuriesCausedByCoach(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Alpha Coach', 1],
        ['Bravo Coach', 0],
      ]);
      expect(
        namesAndAverages(
          await service.averageLastingInjuriesSufferedByCoach(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo Coach', 1],
        ['Alpha Coach', 0],
      ]);
    });

    it('averages serious injuries suffered', async () => {
      expect(
        namesAndAverages(
          await service.averageSeriousInjuriesSufferedByCoach(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Bravo Coach', 1],
        ['Alpha Coach', 0],
      ]);
    });

    it('averages deaths caused and suffered, honouring the limit', async () => {
      expect(
        namesAndAverages(
          await service.averageDeathsCausedByCoach(
            FACT_SCOPE_ALL_TIME,
            'desc',
            10,
          ),
        ),
      ).toEqual([
        ['Alpha Coach', 1],
        ['Bravo Coach', 0],
      ]);
      expect(
        namesAndAverages(
          await service.averageDeathsSufferedByCoach(
            FACT_SCOPE_ALL_TIME,
            'asc',
            1,
          ),
        ),
      ).toEqual([['Alpha Coach', 0]]);
    });
  });

  describe('scopes', () => {
    let first: LeagueFixture;
    let second: LeagueFixture;

    beforeEach(async () => {
      first = await seedLeague(db, 'One');
      second = await seedLeague(db, 'Two');
      const pId = await seedTeam(db, 'P Team', await seedCoach(db, 'P Coach'));
      const qId = await seedTeam(db, 'Q Team', await seedCoach(db, 'Q Coach'));
      await playMatches(db, {
        count: 5,
        competitionId: first.competitionId,
        sides: [
          {
            teamEraId: await joinEra(db, pId, first.eraId),
            score: 0,
            events: [{ actionType: 'badly_hurt' }],
          },
          { teamEraId: await joinEra(db, qId, first.eraId), score: 0 },
        ],
      });
      await playMatches(db, {
        count: 5,
        competitionId: second.competitionId,
        category: 'season_final',
        sides: [
          {
            teamEraId: await joinEra(db, pId, second.eraId),
            score: 0,
            events: [
              { actionType: 'badly_hurt' },
              { actionType: 'badly_hurt' },
              { actionType: 'badly_hurt' },
            ],
          },
          { teamEraId: await joinEra(db, qId, second.eraId), score: 0 },
        ],
      });
    });

    async function topAverage(scope: FactScope): Promise<number> {
      const [top] = await service.averageCasualtiesCausedByCoach(
        scope,
        'desc',
        1,
      );
      expect(top.name).toBe('P Coach');
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
