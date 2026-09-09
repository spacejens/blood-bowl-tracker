import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { FACT_SCOPE_ALL_TIME } from './fact-scope';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';
import { TrophyAwardCountsService } from './trophy-award-counts.service';

describe('TrophyAwardCountsService', () => {
  let service: TrophyAwardCountsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [TrophyAwardCountsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(TrophyAwardCountsService);
    return { db, chains };
  }

  describe('countTrophiesByTeam', () => {
    it('returns the rows the query resolves to, joining trophy awards through the winning team era', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 5 },
        { teamId: 2, name: 'Reikland Reavers', count: 2 },
      ];
      const { db, chains } = await build(rows);
      await expect(
        service.countTrophiesByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      // Counts every trophy_awards row tied to the team via its team era, so
      // player-kind awards (MVP, most casualties, ...) are included.
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'trophy_awards.team_era_id']);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      // Grouped by team, not coach - distinguishes this from its
      // countTrophiesByCoach sibling, which shares the same select shape.
      expect(extractJoinColumns(firstCallArg(chains[0].groupBy, 0, 0))).toEqual(
        ['teams.id'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].groupBy, 0, 1))).toEqual(
        ['teams.name'],
      );
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('filters by league when a leagueId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByTeam({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9,
      ]);
    });

    it('filters by era when an eraId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByTeam({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
    });

    it('filters by competition when a competitionId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByTeam({ competitionId: 30 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(30);
    });

    it('ignores a match category, which trophy awards have no dimension for', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByTeam({ category: 'cup_final' }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([]);
    });

    it('returns an empty list when no team has won anything', async () => {
      const { chains } = await build([]);
      await expect(
        service.countTrophiesByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual([]);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });
  });

  describe('countTrophiesByCoach', () => {
    it('returns the rows the query resolves to, extending the team join graph to the coach', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 7 },
        { coachId: 2, name: 'Grashnak', count: 1 },
      ];
      const { db, chains } = await build(rows);
      await expect(
        service.countTrophiesByCoach(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'trophy_awards.team_era_id']);
      // One hop more than the team-grouped sibling: teams.coach_id -> coaches.id,
      // so a coach's total sums every team they have coached.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['coaches.id', 'teams.coach_id']);
      // Grouped by coach, not team - the coach's total sums every team they
      // have coached, unlike the team-grouped sibling above.
      expect(extractJoinColumns(firstCallArg(chains[0].groupBy, 0, 0))).toEqual(
        ['coaches.id'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].groupBy, 0, 1))).toEqual(
        ['coaches.name'],
      );
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('filters by league when a leagueId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByCoach({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9,
      ]);
    });

    it('filters by era when an eraId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByCoach({ eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
    });

    it('filters by competition when a competitionId is given', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByCoach({ competitionId: 30 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(30);
    });

    it('ignores a match category, which trophy awards have no dimension for', async () => {
      const { chains } = await build([]);
      await service.countTrophiesByCoach({ category: 'cup_final' }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([]);
    });

    it('returns an empty list when no coach has won anything', async () => {
      const { chains } = await build([]);
      await expect(
        service.countTrophiesByCoach(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual([]);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });
  });
});
