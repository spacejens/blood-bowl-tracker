import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayersService } from '../players/players.service';
import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import {
  CASUALTY_CAUSED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  SENT_OFF_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TeamsStatisticsService } from './teams-statistics.service';

describe('TeamsStatisticsService', () => {
  let service: TeamsStatisticsService;
  let matchEventCounts: MockProxy<MatchEventCountsService>;
  let matchOutcomeCounts: MockProxy<MatchOutcomeCountsService>;
  let players: MockProxy<PlayersService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsStatisticsService,
        { provide: MatchEventCountsService, useValue: matchEventCounts },
        { provide: MatchOutcomeCountsService, useValue: matchOutcomeCounts },
        { provide: PlayersService, useValue: players },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TeamsStatisticsService);
    return { db, chains };
  }

  beforeEach(() => {
    matchEventCounts = mock<MatchEventCountsService>();
    matchOutcomeCounts = mock<MatchOutcomeCountsService>();
    players = mock<PlayersService>();
  });

  describe('getTopPlayersByTotalSpp', () => {
    it('asks PlayersService for the team, capped to the limit, and returns its rows', async () => {
      const rows = [
        {
          playerId: 1,
          name: 'Griff',
          count: 42,
          positionId: 30,
          positionName: 'Blitzer',
          isStarPlayer: false,
        },
      ];
      players.topPlayersByTotalSppForTeam.mockResolvedValue(rows);
      await build();

      await expect(service.getTopPlayersByTotalSpp(7, 10)).resolves.toEqual(
        rows,
      );

      expect(players.topPlayersByTotalSppForTeam).toHaveBeenCalledWith(7, 10);
    });
  });

  describe('toplist queries', () => {
    it('countMatchesPlayedByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 12 },
        { teamId: 2, name: 'Reikland Reavers', count: 7 },
      ];
      const { db } = await build(rows);
      await expect(
        service.countMatchesPlayedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('countMatchesPlayedByTeam applies the SQL limit and filters by era when an eraId is given', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 3 }];
      const { chains } = await build(rows);
      await expect(
        service.countMatchesPlayedByTeam({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      // The era-filtered path must add a WHERE clause.
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'matches.id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it.each([
      ['countMatchesWonByTeam', 'won'],
      ['countMatchesLostByTeam', 'lost'],
      ['countMatchesDrawnByTeam', 'drawn'],
    ] as const)(
      '%s asks MatchOutcomeCountsService for its own outcome and returns the rows',
      async (method, outcome) => {
        const rows = [
          { teamId: 1, name: '40 grinders', count: 6 },
          { teamId: 2, name: 'Reikland Reavers', count: 2 },
        ];
        matchOutcomeCounts.countMatchesWithOutcomeByTeam.mockResolvedValue(
          rows,
        );
        await build();

        await expect(service[method](FACT_SCOPE_ALL_TIME, 21)).resolves.toEqual(
          rows,
        );

        expect(
          matchOutcomeCounts.countMatchesWithOutcomeByTeam,
        ).toHaveBeenCalledWith({
          outcome,
          scope: FACT_SCOPE_ALL_TIME,
          limit: 21,
        });
      },
    );

    it('countCompetitionsByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 4 },
        { teamId: 2, name: 'Reikland Reavers', count: 4 },
      ];
      const { db } = await build(rows);
      await expect(
        service.countCompetitionsByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('countCompetitionsByTeam applies the SQL limit and filters by era when an eraId is given', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 2 }];
      const { chains } = await build(rows);
      await expect(
        service.countCompetitionsByTeam({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      // The era-filtered path must add a WHERE clause.
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['competition_teams.competition_id', 'competitions.id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countCompetitionsByTeam still calls where (with undefined) when no era is given', async () => {
      const rows: unknown[] = [];
      const { chains } = await build(rows);
      await expect(
        service.countCompetitionsByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
    });

    it('countErasByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 3 },
        { teamId: 2, name: 'Reikland Reavers', count: 3 },
      ];
      const { db, chains } = await build(rows);
      await expect(service.countErasByTeam(21)).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countErasByTeam takes no era filter and issues no where clause', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 5 }];
      const { chains } = await build(rows);
      await expect(service.countErasByTeam(21)).resolves.toEqual(rows);
      expect(chains[0].where).not.toHaveBeenCalled();
    });

    it('countTrophiesByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 5 },
        { teamId: 2, name: 'Reikland Reavers', count: 2 },
      ];
      const { db, chains } = await build(rows);
      await expect(
        service.countTrophiesByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      // Counts every trophy_awards row tied to the team via its team era —
      // the same aggregation TrophyAwardsService.countByTeam does for one
      // team, so player-kind awards are included.
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'trophy_awards.team_era_id']);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countTrophiesByTeam filters by league when a leagueId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByTeam({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9,
      ]);
    });

    it('countTrophiesByTeam filters by era when an eraId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByTeam({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
    });

    it('countTrophiesByTeam filters by competition when a competitionId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByTeam({ competitionId: 30 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(30);
    });

    it('countTrophiesByTeam ignores a match category, which trophy awards have no dimension for', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByTeam({ category: 'cup_final' }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([]);
    });

    it('countTrophiesByTeam returns an empty list when no team has won anything', async () => {
      const { chains } = await build([]);
      await expect(
        service.countTrophiesByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual([]);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it.each([
      ['countTouchdownsScoredByTeam', 'acting', TOUCHDOWN_TYPES],
      ['countCompletionsByTeam', 'acting', COMPLETION_TYPES],
      ['countInterceptionsByTeam', 'acting', INTERCEPTION_TYPES],
      ['countDeflectionsByTeam', 'acting', DEFLECTION_TYPES],
      ['countCasualtiesCausedByTeam', 'acting', CASUALTY_CAUSED_TYPES],
      [
        'countSeriousInjuriesCausedByTeam',
        'acting',
        SERIOUS_INJURY_CAUSED_TYPES,
      ],
      ['countDeathsCausedByTeam', 'acting', DEATH_CAUSED_TYPES],
      ['countFoulsCommittedByTeam', 'acting', FOUL_TYPES],
      ['countTimesSentOffByTeam', 'consequence', SENT_OFF_TYPES],
    ] as const)(
      '%s asks MatchEventCountsService for its own selector and returns the rows',
      async (method, role, types) => {
        const rows = [{ teamId: 1, name: '40 grinders', count: 15 }];
        matchEventCounts.countMatchEventsByTeam.mockResolvedValue(rows);
        await build();

        await expect(service[method](FACT_SCOPE_ALL_TIME, 21)).resolves.toEqual(
          rows,
        );

        expect(matchEventCounts.countMatchEventsByTeam).toHaveBeenCalledWith({
          selector: { role, types },
          scope: FACT_SCOPE_ALL_TIME,
          limit: 21,
        });
      },
    );

    it('countMatchesPlayedByTeam filters by the match category', async () => {
      const { chains } = await build([]);
      await service.countMatchesPlayedByTeam({ category: 'season_final' }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'season_final',
      ]);
    });

    it('countCompetitionsByTeam does not join matches when no category is given', async () => {
      const { chains } = await build([]);
      await service.countCompetitionsByTeam({ eraId: 20 }, 21);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
    });

    it('countCompetitionsByTeam counts only competitions with a match of the given category', async () => {
      const { chains } = await build([]);
      await service.countCompetitionsByTeam({ category: 'cup_final' }, 21);
      // Two extra joins (match_teams, matches) carry the category filter.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
      expect(
        extractAllFilterValues(firstCallArg(chains[0].innerJoin, 5, 1)),
      ).toContain('cup_final');
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });
  });

  describe('league scoping', () => {
    it('countMatchesPlayedByTeam filters by league via the eras join', async () => {
      const { chains } = await build([]);
      await service.countMatchesPlayedByTeam({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('countCompetitionsByTeam filters by league via the eras join', async () => {
      const { chains } = await build([]);
      await service.countCompetitionsByTeam({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });
});
