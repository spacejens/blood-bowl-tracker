import type { Db } from '@blood-bowl-tracker/db';
import { DB, teams } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import {
  CASUALTY_CAUSED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEFLECTION_TYPES,
  FACT_SCOPE_ALL_TIME,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  TOUCHDOWN_TYPES,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import { TrophyAwardCountsService } from '../shared/trophy-award-counts.service';
import { CoachMatchGapsService } from './coach-match-gaps.service';
import { CoachParticipationCountsService } from './coach-participation-counts.service';
import { CoachesQueriesService } from './coaches-queries.service';

describe('CoachesQueriesService', () => {
  let service: CoachesQueriesService;
  let likePattern: MockProxy<LikePatternService>;
  let matchEventCounts: MockProxy<MatchEventCountsService>;
  let matchOutcomeCounts: MockProxy<MatchOutcomeCountsService>;
  let trophyAwardCounts: MockProxy<TrophyAwardCountsService>;
  let coachMatchGaps: MockProxy<CoachMatchGapsService>;
  let coachParticipationCounts: MockProxy<CoachParticipationCountsService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachesQueriesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: MatchEventCountsService, useValue: matchEventCounts },
        { provide: MatchOutcomeCountsService, useValue: matchOutcomeCounts },
        { provide: TrophyAwardCountsService, useValue: trophyAwardCounts },
        { provide: CoachMatchGapsService, useValue: coachMatchGaps },
        {
          provide: CoachParticipationCountsService,
          useValue: coachParticipationCounts,
        },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CoachesQueriesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    matchEventCounts = mock<MatchEventCountsService>();
    matchOutcomeCounts = mock<MatchOutcomeCountsService>();
    trophyAwardCounts = mock<TrophyAwardCountsService>();
    coachMatchGaps = mock<CoachMatchGapsService>();
    coachParticipationCounts = mock<CoachParticipationCountsService>();
  });

  describe('toplist queries', () => {
    it.each([
      ['countMatchesWonByCoach', 'won'],
      ['countMatchesLostByCoach', 'lost'],
      ['countMatchesDrawnByCoach', 'drawn'],
    ] as const)(
      '%s asks MatchOutcomeCountsService for the %s outcome and returns the rows',
      async (method, outcome) => {
        const rows = [
          { coachId: 1, name: 'Roze Madder', count: 5 },
          { coachId: 2, name: 'Grashnak', count: 2 },
        ];
        matchOutcomeCounts.countMatchesWithOutcomeByCoach.mockResolvedValue(
          rows,
        );
        await build();

        await expect(service[method]({ eraId: 20 }, 21)).resolves.toEqual(rows);

        expect(
          matchOutcomeCounts.countMatchesWithOutcomeByCoach,
        ).toHaveBeenCalledWith({
          outcome,
          scope: { eraId: 20 },
          limit: 21,
        });
      },
    );

    describe.each([
      ['countFoulsCommittedByCoach', FOUL_TYPES],
      ['countTouchdownsScoredByCoach', TOUCHDOWN_TYPES],
      ['countCompletionsByCoach', COMPLETION_TYPES],
      ['countInterceptionsByCoach', INTERCEPTION_TYPES],
      ['countDeflectionsByCoach', DEFLECTION_TYPES],
      ['countCasualtiesCausedByCoach', CASUALTY_CAUSED_TYPES],
      ['countSeriousInjuriesCausedByCoach', SERIOUS_INJURY_CAUSED_TYPES],
      ['countDeathsCausedByCoach', DEATH_CAUSED_TYPES],
    ] as const)('%s', (method, types) => {
      it('returns the rows MatchEventCountsService resolves to', async () => {
        const rows = [
          { coachId: 1, name: 'Roze Madder', count: 13 },
          { coachId: 2, name: 'Grashnak', count: 4 },
        ];
        matchEventCounts.countMatchEventsByCoach.mockResolvedValue(rows);
        await build();
        await expect(service[method](FACT_SCOPE_ALL_TIME, 21)).resolves.toEqual(
          rows,
        );
      });

      it('forwards an acting selector for its own event types and drops the competition from the scope', async () => {
        // Coach match-event toplists are league/era/match-category-scoped
        // only, so the competitionId must not reach the count service even
        // though it would accept one.
        await build();
        await service[method](
          {
            leagueId: 9,
            eraId: 20,
            competitionId: 30,
            category: 'season_final',
          },
          21,
        );
        expect(matchEventCounts.countMatchEventsByCoach).toHaveBeenCalledWith({
          selector: { role: 'acting', types },
          scope: { leagueId: 9, eraId: 20, category: 'season_final' },
          limit: 21,
        });
      });
    });

    describe('countLastingInjuriesCausedByCoach', () => {
      it('returns the rows MatchEventCountsService resolves to', async () => {
        const rows = [{ coachId: 1, name: 'Roze Madder', count: 6 }];
        matchEventCounts.countMatchEventsByCoach.mockResolvedValue(rows);
        await build();
        await expect(
          service.countLastingInjuriesCausedByCoach(FACT_SCOPE_ALL_TIME, 21),
        ).resolves.toEqual(rows);
      });

      it('forwards a casualty acting selector narrowed to lasting consequences and drops the competition', async () => {
        // A foul is not in CASUALTY_CAUSED_TYPES, so a foul that leaves a
        // lasting injury earns its coach no credit; the consequence filter
        // keeps only casualties whose own row records a lasting injury.
        await build();
        await service.countLastingInjuriesCausedByCoach(
          {
            leagueId: 9,
            eraId: 20,
            competitionId: 30,
            category: 'season_final',
          },
          21,
        );
        expect(matchEventCounts.countMatchEventsByCoach).toHaveBeenCalledWith({
          selector: {
            role: 'acting',
            types: CASUALTY_CAUSED_TYPES,
            consequenceTypes: LASTING_INJURY_SUFFERED_TYPES,
          },
          scope: { leagueId: 9, eraId: 20, category: 'season_final' },
          limit: 21,
        });
      });
    });

    it('countCasualtiesCausedByCoach does not count fouls', async () => {
      await build();
      await service.countCasualtiesCausedByCoach(FACT_SCOPE_ALL_TIME, 21);
      const [{ selector }] =
        matchEventCounts.countMatchEventsByCoach.mock.calls[0];
      for (const foulType of FOUL_TYPES) {
        expect(selector.types).not.toContain(foulType);
      }
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { db } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    it('returns the distinct coach count for the era', async () => {
      const { db, chains } = await build([{ count: 6 }]);
      await expect(service.countByEra(5)).resolves.toBe(6);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('returns the distinct coach count for the league', async () => {
      const { db, chains } = await build([{ count: 15 }]);
      await expect(service.countByLeague(9)).resolves.toBe(15);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('returns the distinct coach count for the competition', async () => {
      const { db, chains } = await build([{ count: 4 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(4);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'competition_teams.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });

  describe('findById', () => {
    it('returns the coach the query resolves to', async () => {
      const { chains } = await build([{ id: 7, name: 'Roze Madder' }]);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'Roze Madder',
      });
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('returns undefined when no coach matches', async () => {
      const { chains } = await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(999);
    });
  });

  describe('listEras', () => {
    it('returns the id/name rows the query resolves to', async () => {
      const rows = [
        { id: 3, name: 'BB2016' },
        { id: 4, name: 'BB2020' },
      ];
      await build(rows);
      await expect(service.listEras(7)).resolves.toEqual(rows);
    });

    it('returns an empty array when the coach has no teams in any era', async () => {
      await build([]);
      await expect(service.listEras(7)).resolves.toEqual([]);
    });

    it('filters by the requested coach id, not a team id', async () => {
      const { chains } = await build([]);

      await service.listEras(7);

      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'teams.coach_id',
      ]);
    });

    it('joins team_eras to eras and on to teams, so several teams of one coach are covered', async () => {
      const { chains } = await build([]);

      await service.listEras(7);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
    });

    // A coach with two teams in the same era produces two joined rows, which
    // would list that era twice. The dedup is PostgreSQL's, via GROUP BY, so
    // mockDb (which just replays canned rows) cannot demonstrate it by
    // returning duplicates — asserting the grouping columns is what actually
    // pins the guarantee. Real duplicate collapsing is PostgreSQL's own
    // behaviour, not this service's.
    it('groups by era so an era shared by two of the coach teams is listed once', async () => {
      const { chains } = await build([{ id: 4, name: 'BB2020' }]);

      await expect(service.listEras(7)).resolves.toEqual([
        { id: 4, name: 'BB2020' },
      ]);
      expect(extractJoinColumns(firstCallArg(chains[0].groupBy, 0, 0))).toEqual(
        ['eras.id'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].groupBy, 0, 1))).toEqual(
        ['eras.name'],
      );
    });

    it('orders chronologically by era start date, then name', async () => {
      const { chains } = await build([]);

      await service.listEras(7);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['eras.start_date'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['eras.name'],
      );
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns id/name choices for a name prefix, capped to the limit', async () => {
      const rows = [
        { id: 1, name: 'Roze Madder' },
        { id: 2, name: 'Rozzo' },
      ];
      likePattern.escape.mockReturnValue('Ro');
      const { chains } = await build(rows);
      await expect(service.searchByNamePrefix('Ro', 25)).resolves.toEqual(rows);
      expect(likePattern.escape).toHaveBeenCalledWith('Ro');
      expect(chains[0].limit).toHaveBeenCalledWith(25);
    });
  });

  describe('getCareerSpan', () => {
    it('returns the min/max match dates for the coach', async () => {
      const { chains } = await build([
        { start: '2021-09-01', end: '2023-06-10' },
      ]);
      await expect(service.getCareerSpan(7)).resolves.toEqual({
        start: '2021-09-01',
        end: '2023-06-10',
      });
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('returns undefined when the coach has played no matches', async () => {
      await build([{ start: null, end: null }]);
      await expect(service.getCareerSpan(7)).resolves.toBeUndefined();
    });

    it('converts the min/max match timestamps to UTC calendar days', async () => {
      const { db } = await build([{ start: '2021-09-01', end: '2023-06-10' }]);
      await service.getCareerSpan(7);
      const fields = firstCallArg(db.select) as {
        start: unknown;
        end: unknown;
      };
      expect(sqlText(fields.start)).toContain('(min(');
      expect(sqlText(fields.start)).toContain(") at time zone 'UTC')::date");
      expect(sqlText(fields.end)).toContain('(max(');
      expect(sqlText(fields.end)).toContain(") at time zone 'UTC')::date");
    });
  });

  describe('getCareerSpansByIds', () => {
    it('maps each returned row to its career span, keyed by coach id', async () => {
      await build([
        { coachId: 7, start: '2021-09-01', end: '2023-06-10' },
        { coachId: 9, start: '2024-03-16', end: '2024-03-16' },
      ]);
      const spans = await service.getCareerSpansByIds([7, 9]);
      expect(spans.get(7)).toEqual({ start: '2021-09-01', end: '2023-06-10' });
      expect(spans.get(9)).toEqual({ start: '2024-03-16', end: '2024-03-16' });
      expect(spans.size).toBe(2);
    });

    it('filters on the requested coach ids and groups by coach', async () => {
      const { chains } = await build([]);
      await service.getCareerSpansByIds([7, 9]);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toEqual([
        7, 9,
      ]);
      expect(chains[0].groupBy).toHaveBeenCalledWith(teams.coachId);
    });

    it('converts the min/max match timestamps to UTC calendar days', async () => {
      const { db } = await build([]);
      await service.getCareerSpansByIds([7]);
      const fields = firstCallArg(db.select) as {
        start: unknown;
        end: unknown;
      };
      expect(sqlText(fields.start)).toContain('(min(');
      expect(sqlText(fields.start)).toContain(") at time zone 'UTC')::date");
      expect(sqlText(fields.end)).toContain('(max(');
      expect(sqlText(fields.end)).toContain(") at time zone 'UTC')::date");
    });

    it('has no entry for a coach the query returned no row for', async () => {
      await build([{ coachId: 7, start: '2021-09-01', end: '2023-06-10' }]);
      const spans = await service.getCareerSpansByIds([7, 99]);
      expect(spans.get(99)).toBeUndefined();
    });

    it('returns an empty map without querying when no coach ids are given', async () => {
      const { db } = await build([]);
      const spans = await service.getCareerSpansByIds([]);
      expect(spans.size).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('getTopTeamsByMatchesPlayed', () => {
    it('returns teams ranked by match count, capped to the limit', async () => {
      const rows = [
        { id: 11, name: 'Reikland Reavers', count: 12 },
        { id: 22, name: 'Gouged Eye', count: 5 },
      ];
      const { db, chains } = await build(rows);
      await expect(service.getTopTeamsByMatchesPlayed(7, 10)).resolves.toEqual(
        rows,
      );
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      expect(chains[0].limit).toHaveBeenCalledWith(10);
      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toContain('id');
    });

    it('includes a tie group at the cutoff (relies on a generous limit)', async () => {
      // The service returns whatever the query yields; ranking/tie-cutoff is
      // the resolver's job. This asserts the limit is passed through so a
      // tie at the 5th place can be detected downstream.
      const rows = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        count: i < 6 ? 5 : 1,
      }));
      const { chains } = await build(rows);
      await expect(service.getTopTeamsByMatchesPlayed(7, 10)).resolves.toEqual(
        rows,
      );
      expect(chains[0].limit).toHaveBeenCalledWith(10);
    });
  });

  describe('time between matches toplists', () => {
    it.each([
      'getGapBetweenMatchesByCoachDescending',
      'getGapBetweenMatchesByCoachAscending',
      'getAverageGapBetweenMatchesByCoach',
    ] as const)(
      '%s delegates to CoachMatchGapsService with the scope and limit',
      async (method) => {
        // The gap queries themselves are covered by
        // coach-match-gaps.service.spec.ts.
        const rows = [{ coachId: 1, name: 'Roze Madder', count: 91 }];
        coachMatchGaps[method].mockResolvedValue(rows);
        const { db } = await build();
        await expect(
          service[method]({ leagueId: 9, eraId: 20 }, 21),
        ).resolves.toEqual(rows);
        expect(coachMatchGaps[method]).toHaveBeenCalledWith(
          { leagueId: 9, eraId: 20 },
          21,
        );
        expect(db.select).not.toHaveBeenCalled();
      },
    );
  });

  describe('participation toplists', () => {
    it.each([
      'countMatchesPlayedByCoach',
      'countCompetitionsByCoach',
      'countTeamsByCoach',
    ] as const)(
      '%s delegates to CoachParticipationCountsService with the scope and limit',
      async (method) => {
        // The queries themselves are covered by
        // coach-participation-counts.service.spec.ts.
        const rows = [{ coachId: 1, name: 'Roze Madder', count: 9 }];
        coachParticipationCounts[method].mockResolvedValue(rows);
        const { db } = await build();
        await expect(
          service[method](
            { leagueId: 9, eraId: 20, category: 'cup_final' },
            21,
          ),
        ).resolves.toEqual(rows);
        expect(coachParticipationCounts[method]).toHaveBeenCalledWith(
          { leagueId: 9, eraId: 20, category: 'cup_final' },
          21,
        );
        expect(db.select).not.toHaveBeenCalled();
      },
    );

    it('countErasByCoach delegates to CoachParticipationCountsService with the limit', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 3 }];
      coachParticipationCounts.countErasByCoach.mockResolvedValue(rows);
      const { db } = await build();
      await expect(service.countErasByCoach(21)).resolves.toEqual(rows);
      expect(coachParticipationCounts.countErasByCoach).toHaveBeenCalledWith(
        21,
      );
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('countTrophiesByCoach', () => {
    it('returns the rows TrophyAwardCountsService resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 7 },
        { coachId: 2, name: 'Grashnak', count: 1 },
      ];
      trophyAwardCounts.countTrophiesByCoach.mockResolvedValue(rows);
      const { db } = await build();
      await expect(
        service.countTrophiesByCoach(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      // The query lives on the shared service, covered by its own spec.
      expect(db.select).not.toHaveBeenCalled();
    });

    it('forwards the whole scope and limit verbatim, competition included', async () => {
      // Unlike the match-event-backed coach counts, this one keeps the
      // competitionId: a trophy award belongs to a competition, so
      // coach.toplist.trophies.won declares supportsCompetition: true.
      trophyAwardCounts.countTrophiesByCoach.mockResolvedValue([]);
      await build();
      await service.countTrophiesByCoach(
        { leagueId: 9, eraId: 20, competitionId: 30 },
        21,
      );
      expect(trophyAwardCounts.countTrophiesByCoach).toHaveBeenCalledWith(
        { leagueId: 9, eraId: 20, competitionId: 30 },
        21,
      );
    });
  });
});
