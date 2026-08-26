import type { Db } from '@blood-bowl-tracker/db';
import { DB, raceEras, races } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { is, SQL, StringChunk } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { RacesService, RaceUpsertConflictError } from './races.service';

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
  return is(first, StringChunk) && first.value.join('').includes('distinct');
}

const fakeRace = {
  id: 1,
  name: 'Orc',
  createdAt: new Date('2026-01-01'),
};

describe('RacesService', () => {
  let service: RacesService;
  let likePattern: MockProxy<LikePatternService>;
  let matchOutcomeCounts: MockProxy<MatchOutcomeCountsService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RacesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: MatchOutcomeCountsService, useValue: matchOutcomeCounts },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(RacesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    matchOutcomeCounts = mock<MatchOutcomeCountsService>();
  });

  describe('upsert', () => {
    const baseData = {
      name: 'Orc',
      eras: [5, 6],
      externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
    };

    it('creates a new race with its eras when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: the one external ID is new and gets
      // inserted; query 3: no existing race_eras rows; query 4: both era
      // links are new and get inserted.
      const { chains } = await build([], [fakeRace], [], [], []);

      const result = await service.upsert(baseData);
      expect(result).toEqual({
        race: { ...fakeRace, eras: [5, 6] },
        created: true,
      });
      expect(chains).toHaveLength(5);
    });

    it('defaults to no era links when eras is empty', async () => {
      // eras: [] means toInsert is always empty, so query 4 (the race_eras
      // insert) never runs.
      const { chains } = await build([], [fakeRace], [], []);

      const result = await service.upsert({
        name: 'Orc',
        eras: [],
        externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
      });
      expect(result.race.eras).toEqual([]);
      expect(chains).toHaveLength(4);
    });

    it('inserts only the race_eras rows that are new', async () => {
      const { db, chains } = await build(
        [],
        [fakeRace],
        [],
        [{ eraId: 5 }],
        [],
      );
      const result = await service.upsert(baseData);
      expect(firstCallArg(chains[4].values)).toEqual([{ raceId: 1, eraId: 6 }]);
      expect(result.race.eras).toEqual([5, 6]);
      expect(db.insert).toHaveBeenCalledWith(raceEras);
    });

    it('does not insert race_eras rows when all links already exist', async () => {
      const { db, chains } = await build(
        [],
        [fakeRace],
        [],
        [{ eraId: 5 }, { eraId: 6 }],
      );
      const result = await service.upsert(baseData);
      expect(chains).toHaveLength(4);
      expect(db.insert).not.toHaveBeenCalledWith(raceEras);
      expect(result.race.eras).toEqual([5, 6]);
    });

    it('updates the matching race when exactly one external ID matches', async () => {
      // query 0: external-id lookup finds one owner (the one external ID
      // already matches, so no join-table insert runs); query 1: the update
      // returns the row; query 2: no existing race_eras rows; query 3: both
      // era links are new and get inserted.
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Orc' }],
        [fakeRace],
        [],
        [],
      );
      const result = await service.upsert(baseData);
      expect(result.created).toBe(false);
      expect(chains).toHaveLength(4);
      expect(db.update).toHaveBeenCalledWith(races);
    });

    it('throws RaceUpsertConflictError when external IDs match different races', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: 'Orc' },
        { ownerId: 2, externalSystemId: 2, externalId: 'Orc' },
      ]);
      await expect(service.upsert(baseData)).rejects.toThrow(
        RaceUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('re-selects instead of updating when the payload names no entity fields', async () => {
      // The lookup matches race 1, so the update is skipped and the row is
      // re-selected instead; the additive era sync still issues its own
      // queries (existing race_eras lookup, then the new link insert).
      const { db } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Orc' }],
        [fakeRace],
        [],
        [],
      );

      const result = await service.upsert({
        eras: [5],
        externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
      });

      expect(db.update).not.toHaveBeenCalled();
      expect(result.race).toEqual({ ...fakeRace, eras: [5] });
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { db } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('toplist queries', () => {
    it('countTeamsByRace returns the rows the query resolves to', async () => {
      const rows = [
        { raceId: 1, name: 'Orc', count: 12 },
        { raceId: 2, name: 'Skaven', count: 7 },
      ];
      const { db } = await build(rows);
      await expect(
        service.countTeamsByRace(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      const selectedFields = firstCallArg(db.select, 0, 0) as {
        count: unknown;
      };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });

    it('countTeamsByRace returns an empty array when there is no data', async () => {
      await build([]);
      await expect(
        service.countTeamsByRace(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual([]);
    });

    it('countTeamsByRace joins team_eras when an eraId is given', async () => {
      const rows = [{ raceId: 1, name: 'Orc', count: 3 }];
      const { chains } = await build(rows);
      await expect(
        service.countTeamsByRace({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      // Era path adds a second innerJoin (teams + teamEras) vs. one when unfiltered.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['teams.race_id', 'races.id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['team_eras.team_id', 'teams.id', 'team_eras.era_id']);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countMatchesPlayedByRace returns the rows the query resolves to', async () => {
      const rows = [
        { raceId: 1, name: 'Orc', count: 40 },
        { raceId: 2, name: 'Skaven', count: 18 },
      ];
      const { db } = await build(rows);
      await expect(
        service.countMatchesPlayedByRace(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('countMatchesPlayedByRace filters by era when an eraId is given', async () => {
      const rows = [{ raceId: 1, name: 'Orc', count: 6 }];
      const { chains } = await build(rows);
      await expect(
        service.countMatchesPlayedByRace({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countMatchesPlayedByRace filters by the match category', async () => {
      const { chains } = await build([]);
      await service.countMatchesPlayedByRace({ category: 'season_final' }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'season_final',
      ]);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1)),
      ).toEqual(['matches.id', 'match_teams.match_id']);
    });

    it.each([
      ['countMatchesWonByRace', 'won'],
      ['countMatchesLostByRace', 'lost'],
      ['countMatchesDrawnByRace', 'drawn'],
    ] as const)(
      '%s asks MatchOutcomeCountsService for the %s outcome and returns the rows',
      async (method, outcome) => {
        const rows = [
          { raceId: 1, name: 'Orc', count: 14 },
          { raceId: 2, name: 'Skaven', count: 5 },
        ];
        matchOutcomeCounts.countMatchesWithOutcomeByRace.mockResolvedValue(
          rows,
        );
        await build();

        await expect(service[method]({ leagueId: 9 }, 21)).resolves.toEqual(
          rows,
        );

        expect(
          matchOutcomeCounts.countMatchesWithOutcomeByRace,
        ).toHaveBeenCalledWith({ outcome, scope: { leagueId: 9 }, limit: 21 });
      },
    );
  });

  describe('league scoping', () => {
    it('countMatchesPlayedByRace filters by league via the eras join', async () => {
      const { chains } = await build([]);
      await service.countMatchesPlayedByRace({ leagueId: 9 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('countTeamsByRace counts teams of the race active in an era of the league', async () => {
      const rows = [{ raceId: 1, name: 'Orc', count: 2 }];
      const { chains } = await build(rows);
      await expect(
        service.countTeamsByRace({ leagueId: 9 }, 21),
      ).resolves.toEqual(rows);
      // League path adds two innerJoins (teams + teamEras + eras) vs. one unfiltered.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id', 'eras.league_id']);
    });

    it('countTeamsByRace does not double-count a team with teamEras rows in two eras of the same league', async () => {
      // The league scope joins teamEras unfiltered by era, then filters by
      // eras.leagueId. A team with separate teamEras rows in two different
      // eras of the *same* league (no unique constraint on teamId alone)
      // would join to two rows and be counted twice unless the aggregate
      // uses DISTINCT on teams.id.
      const rows = [{ raceId: 1, name: 'Orc', count: 1 }];
      const { db } = await build(rows);
      await expect(
        service.countTeamsByRace({ leagueId: 9 }, 21),
      ).resolves.toEqual(rows);
      const selectedFields = firstCallArg(db.select, 0, 0) as {
        count: unknown;
      };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });
  });

  describe('countByEra', () => {
    it('returns the distinct race count for the era', async () => {
      const { db, chains } = await build([{ count: 8 }]);
      await expect(service.countByEra(5)).resolves.toBe(8);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('returns the distinct race count for the league', async () => {
      const { db, chains } = await build([{ count: 12 }]);
      await expect(service.countByLeague(9)).resolves.toBe(12);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'race_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('returns the distinct race count for the competition', async () => {
      const { db, chains } = await build([{ count: 5 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(5);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'competition_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });

  describe('findById', () => {
    it('returns the race row when it exists', async () => {
      const rows = [{ id: 1, name: 'Orc' }];
      await build(rows);
      await expect(service.findById(1)).resolves.toEqual({
        id: 1,
        name: 'Orc',
      });
    });

    it('returns undefined when no race matches', async () => {
      await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns id/name rows matching the prefix and forwards the limit', async () => {
      const rows = [{ id: 1, name: 'Orc' }];
      likePattern.escape.mockReturnValue('or');
      const { chains } = await build(rows);
      await expect(service.searchByNamePrefix('or', 25)).resolves.toEqual(rows);
      expect(chains[0].limit).toHaveBeenCalledWith(25);
    });

    it('returns an empty array when nothing matches the prefix', async () => {
      likePattern.escape.mockReturnValue('zz');
      await build([]);
      await expect(service.searchByNamePrefix('zz', 25)).resolves.toEqual([]);
    });
  });

  describe('listEras', () => {
    it('returns the id/name rows the query resolves to', async () => {
      const rows = [
        { id: 3, name: 'BB2016' },
        { id: 4, name: 'BB2020' },
      ];
      await build(rows);
      await expect(service.listEras(1)).resolves.toEqual(rows);
    });

    it('returns an empty array when the race is linked to no eras', async () => {
      await build([]);
      await expect(service.listEras(1)).resolves.toEqual([]);
    });

    it('orders eras chronologically by start date, then name', async () => {
      const rows = [
        { id: 4, name: 'BB2020' },
        { id: 3, name: 'BB2016' },
      ];
      const { chains } = await build(rows);

      await service.listEras(1);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['eras.start_date'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['eras.name'],
      );
    });
  });

  describe('getTopTeamsByMatchesPlayed', () => {
    it('returns the team rows (with id) and forwards the limit', async () => {
      const rows = [{ id: 9, name: 'Reikland Reavers', count: 12 }];
      const { db, chains } = await build(rows);
      await expect(service.getTopTeamsByMatchesPlayed(1, 10)).resolves.toEqual(
        rows,
      );
      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toContain('id');
      expect(chains[0].limit).toHaveBeenCalledWith(10);
    });

    it('returns an empty array when the race has no matches', async () => {
      await build([]);
      await expect(service.getTopTeamsByMatchesPlayed(1, 10)).resolves.toEqual(
        [],
      );
    });
  });
});
