import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from './db-mock.test-helpers';
import { mockDb } from './db-mock.test-helpers';
import { FACT_SCOPE_ALL_TIME } from './fact-scope';
import { MatchOutcomeCountsService } from './match-outcome-counts.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';

describe('MatchOutcomeCountsService', () => {
  let service: MatchOutcomeCountsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [MatchOutcomeCountsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(MatchOutcomeCountsService);
    return { db, chains };
  }

  describe('countMatchesWithOutcomeByCoach', () => {
    it('returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 7 },
        { coachId: 2, name: 'Grashnak', count: 3 },
      ];
      await build(rows);
      await expect(
        service.countMatchesWithOutcomeByCoach({
          outcome: 'won',
          scope: FACT_SCOPE_ALL_TIME,
          limit: 21,
        }),
      ).resolves.toEqual(rows);
    });

    it('joins coaches through match_teams, team_eras, eras and teams', async () => {
      const { db, chains } = await build([]);
      await service.countMatchesWithOutcomeByCoach({
        outcome: 'won',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'matches.id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1)),
      ).toEqual(['coaches.id', 'teams.coach_id']);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('filters a won count on the coach own match_teams row', async () => {
      const { chains } = await build([]);
      await service.countMatchesWithOutcomeByCoach({
        outcome: 'won',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'matches.winning_match_team_id',
        'match_teams.id',
      ]);
    });

    it('filters a lost count on a non-null winner that is not the coach own row', async () => {
      const { chains } = await build([]);
      await service.countMatchesWithOutcomeByCoach({
        outcome: 'lost',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'matches.winning_match_team_id',
        'matches.winning_match_team_id',
        'match_teams.id',
      ]);
    });

    it('filters a drawn count on a null winner', async () => {
      const { chains } = await build([]);
      await service.countMatchesWithOutcomeByCoach({
        outcome: 'drawn',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'matches.winning_match_team_id',
      ]);
    });

    it('applies the league, era and match-category scope filters', async () => {
      const { chains } = await build([], [], []);
      await service.countMatchesWithOutcomeByCoach({
        outcome: 'won',
        scope: { leagueId: 9 },
        limit: 21,
      });
      await service.countMatchesWithOutcomeByCoach({
        outcome: 'won',
        scope: { eraId: 20 },
        limit: 21,
      });
      await service.countMatchesWithOutcomeByCoach({
        outcome: 'won',
        scope: { category: 'season_final' },
        limit: 21,
      });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9,
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[1].where))).toEqual([
        20,
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[2].where))).toEqual([
        'season_final',
      ]);
    });
  });

  describe('countMatchesWithOutcomeByTeam', () => {
    it('returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 5 }];
      await build(rows);
      await expect(
        service.countMatchesWithOutcomeByTeam({
          outcome: 'drawn',
          scope: FACT_SCOPE_ALL_TIME,
          limit: 21,
        }),
      ).resolves.toEqual(rows);
    });

    it('groups by team without joining coaches', async () => {
      const { chains } = await build([]);
      await service.countMatchesWithOutcomeByTeam({
        outcome: 'won',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('filters a lost count on a non-null winner that is not the team own row', async () => {
      const { chains } = await build([]);
      await service.countMatchesWithOutcomeByTeam({
        outcome: 'lost',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'matches.winning_match_team_id',
        'matches.winning_match_team_id',
        'match_teams.id',
      ]);
    });
  });

  describe('countMatchesWithOutcomeByRace', () => {
    it('returns the rows the query resolves to', async () => {
      const rows = [{ raceId: 1, name: 'Orc', count: 11 }];
      await build(rows);
      await expect(
        service.countMatchesWithOutcomeByRace({
          outcome: 'won',
          scope: FACT_SCOPE_ALL_TIME,
          limit: 21,
        }),
      ).resolves.toEqual(rows);
    });

    it('keeps the matches join last so it counts one participation per team', async () => {
      const { chains } = await build([]);
      await service.countMatchesWithOutcomeByRace({
        outcome: 'won',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1)),
      ).toEqual(['matches.id', 'match_teams.match_id']);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('filters a drawn count on a null winner', async () => {
      const { chains } = await build([]);
      await service.countMatchesWithOutcomeByRace({
        outcome: 'drawn',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'matches.winning_match_team_id',
      ]);
    });
  });
});
