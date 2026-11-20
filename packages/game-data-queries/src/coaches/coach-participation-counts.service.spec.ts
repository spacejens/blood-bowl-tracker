import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  is,
  mockDb,
  SQL,
  StringChunk,
} from '@blood-bowl-tracker/db/test-helpers';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { CoachParticipationCountsService } from './coach-participation-counts.service';

/**
 * True when a captured aggregate expression is `countDistinct(...)` rather
 * than plain `count(...)`. drizzle-orm renders `countDistinct` as
 * `sql`count(distinct ${expr})`` — its first query chunk is a `StringChunk`
 * whose text starts with "count(distinct ", vs. "count(" for plain `count`.
 * Used to guard against double-counting when a join can legitimately produce
 * more than one row per grouped entity (e.g. a team with `teamEras` rows in
 * two eras of the same league).
 */
function isCountDistinct(expr: unknown): boolean {
  if (!is(expr, SQL)) return false;
  const first = expr.queryChunks[0];
  // `[value].flat()` accepts `StringChunk.value` whether drizzle-orm types it
  // as a string or as an array of strings.
  return (
    is(first, StringChunk) && [first.value].flat().join('').includes('distinct')
  );
}

describe('CoachParticipationCountsService', () => {
  let service: CoachParticipationCountsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachParticipationCountsService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CoachParticipationCountsService);
    return { db, chains };
  }

  describe('toplist queries', () => {
    it('countMatchesPlayedByCoach returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 9 },
        { coachId: 2, name: 'Grashnak', count: 4 },
      ];
      const { db } = await build(rows);
      await expect(
        service.countMatchesPlayedByCoach(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('countTeamsByCoach returns the rows the query resolves to', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 3 }];
      const { db } = await build(rows);
      await expect(
        service.countTeamsByCoach(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      const selectedFields = firstCallArg(db.select, 0, 0) as {
        count: unknown;
      };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });

    it('countMatchesPlayedByCoach filters by era when an eraId is given', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 2 }];
      const { chains } = await build(rows);
      await expect(
        service.countMatchesPlayedByCoach({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'matches.id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countTeamsByCoach joins team_eras when an eraId is given', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 1 }];
      const { db, chains } = await build(rows);
      await expect(
        service.countTeamsByCoach({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      // Era path adds a second innerJoin (teams + teamEras) vs. one when unfiltered.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['team_eras.team_id', 'teams.id', 'team_eras.era_id']);
      const selectedFields = firstCallArg(db.select, 0, 0) as {
        count: unknown;
      };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });

    it('countCompetitionsByCoach returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 5 },
        { coachId: 2, name: 'Grashnak', count: 2 },
      ];
      const { db } = await build(rows);
      await expect(
        service.countCompetitionsByCoach(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('countCompetitionsByCoach filters by era when an eraId is given', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 3 }];
      const { chains } = await build(rows);
      await expect(
        service.countCompetitionsByCoach({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['competition_teams.competition_id', 'competitions.id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countErasByCoach returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 3 },
        { coachId: 2, name: 'Grashnak', count: 3 },
        { coachId: 3, name: 'Skabsquik', count: 1 },
      ];
      const { db, chains } = await build(rows);
      await expect(service.countErasByCoach(21)).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countMatchesPlayedByCoach filters by the match category', async () => {
      const { chains } = await build([]);
      await service.countMatchesPlayedByCoach({ category: 'season_final' }, 21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'season_final',
      ]);
    });

    it('countCompetitionsByCoach does not join matches when no category is given', async () => {
      const { chains } = await build([]);
      await service.countCompetitionsByCoach({ eraId: 20 }, 21);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
    });

    it('countCompetitionsByCoach counts only competitions with a match of the given category', async () => {
      const { chains } = await build([]);
      await service.countCompetitionsByCoach({ category: 'cup_final' }, 21);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(7);
      expect(
        extractAllFilterValues(firstCallArg(chains[0].innerJoin, 6, 1)),
      ).toContain('cup_final');
    });
  });

  describe('league scoping', () => {
    it('countMatchesPlayedByCoach filters by league via the eras join', async () => {
      const { chains } = await build([]);
      await service.countMatchesPlayedByCoach({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('countCompetitionsByCoach filters by league via the eras join', async () => {
      const { chains } = await build([]);
      await service.countCompetitionsByCoach({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('countTeamsByCoach counts teams the coach ran in an era of the league', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 2 }];
      const { chains } = await build(rows);
      await expect(
        service.countTeamsByCoach({ leagueId: 9 }, 21),
      ).resolves.toEqual(rows);
      // League path adds two innerJoins (teams + teamEras + eras) vs. one unfiltered.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id', 'eras.league_id']);
    });

    it('countTeamsByCoach does not double-count a team with teamEras rows in two eras of the same league', async () => {
      // The league scope joins teamEras unfiltered by era, then filters by
      // eras.leagueId. A team with separate teamEras rows in two different
      // eras of the *same* league (no unique constraint on teamId alone)
      // would join to two rows and be counted twice unless the aggregate
      // uses DISTINCT on teams.id.
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 1 }];
      const { db } = await build(rows);
      await expect(
        service.countTeamsByCoach({ leagueId: 9 }, 21),
      ).resolves.toEqual(rows);
      const selectedFields = firstCallArg(db.select, 0, 0) as {
        count: unknown;
      };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });
  });
});
