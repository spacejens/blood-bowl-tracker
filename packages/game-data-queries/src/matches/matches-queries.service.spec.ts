import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { MatchesQueriesService } from './matches-queries.service';

describe('MatchesQueriesService', () => {
  let service: MatchesQueriesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [MatchesQueriesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(MatchesQueriesService);
    return { db, chains };
  }

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { chains } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(chains[0].from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countMatchEvents', () => {
    it('countMatchEvents returns the match-events row count', async () => {
      await build([{ count: 5200 }]);
      await expect(service.countMatchEvents()).resolves.toBe(5200);
    });
  });

  describe('era-scoped counts', () => {
    it('countByEra returns the distinct match count for the era', async () => {
      const { db, chains } = await build([{ count: 30 }]);
      await expect(service.countByEra(5)).resolves.toBe(30);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });

    it('countMatchEventsByEra returns the match-event count for the era', async () => {
      const { chains } = await build([{ count: 210 }]);
      await expect(service.countMatchEventsByEra(5)).resolves.toBe(210);
      // match_events -> match_teams -> team_eras
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'match_events.match_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('league-scoped counts', () => {
    it('countByLeague returns the distinct match count for the league', async () => {
      const { db, chains } = await build([{ count: 55 }]);
      await expect(service.countByLeague(9)).resolves.toBe(55);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('countMatchEventsByLeague returns the match-event count for the league', async () => {
      const { chains } = await build([{ count: 400 }]);
      await expect(service.countMatchEventsByLeague(9)).resolves.toBe(400);
      // match_events -> match_teams -> team_eras -> eras
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'match_events.match_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('competition-scoped counts', () => {
    it('countByCompetition returns the match count for the competition', async () => {
      const { db, chains } = await build([{ count: 30 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(30);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('countMatchEventsByCompetition returns the match-event count for the competition', async () => {
      const { chains } = await build([{ count: 500 }]);
      await expect(service.countMatchEventsByCompetition(7)).resolves.toBe(500);
      // match_events -> matches
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['matches.id', 'match_events.match_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });
});
