import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { is, SQL, StringChunk } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { CoachesService, CoachUpsertConflictError } from './coaches.service';

const fakeCoach = {
  id: 1,
  name: 'Roze Madder',
  createdAt: new Date('2026-01-01'),
};

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

/**
 * Flatten a captured drizzle expression back to its static SQL text, so specs
 * can assert on the parts of a hand-written `sql` template that matter
 * (`lag(`, `over (partition by`, `max(`, `avg(`, `round(`, ` asc` / ` desc`).
 * Interpolated values are omitted — under mockDb they are mock objects, not
 * real columns. Accepts a bare `SQL` or an aliased one (`sql`...`.as('x')`).
 */
function sqlText(expr: unknown): string {
  const node = is(expr, SQL) ? expr : (expr as { sql?: unknown } | null)?.sql;
  if (!is(node, SQL)) return '';
  return node.queryChunks
    .map((chunk) =>
      is(chunk, StringChunk) ? chunk.value.join('') : sqlText(chunk),
    )
    .join('');
}

describe('CoachesService', () => {
  let service: CoachesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CoachesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  describe('upsert', () => {
    const externalIds = [
      { externalSystemId: 1, externalId: 'id:47' },
      { externalSystemId: 1, externalId: 'name:roze madder' },
    ];

    it('creates a new coach when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: both external IDs are new, so they get
      // inserted into the join table.
      const { db, chains } = await build([], [fakeCoach]);

      const result = await service.upsert({ name: 'Roze Madder', externalIds });

      expect(result).toEqual({ coach: fakeCoach, created: true });
      expect(chains).toHaveLength(3);
      expect(db.insert).toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('updates the matching coach when exactly one external ID matches', async () => {
      // query 0: external-id lookup finds one owner; query 1: the update
      // returns the row; query 2: the one still-missing external ID gets
      // inserted.
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'id:47' }],
        [fakeCoach],
      );

      const result = await service.upsert({ name: 'Roze Madder', externalIds });

      expect(result).toEqual({ coach: fakeCoach, created: false });
      expect(chains).toHaveLength(3);
      expect(db.update).toHaveBeenCalled();
    });

    it('throws CoachUpsertConflictError when external IDs match different coaches', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: 'id:47' },
        { ownerId: 2, externalSystemId: 1, externalId: 'name:roze madder' },
      ]);

      await expect(
        service.upsert({ name: 'Roze Madder', externalIds }),
      ).rejects.toThrow(CoachUpsertConflictError);
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched coach', async () => {
      // Both external IDs already resolve to the same owner, so no join-table
      // insert is issued: only the lookup and the update run.
      const { db, chains } = await build(
        [
          { ownerId: 1, externalSystemId: 1, externalId: 'id:47' },
          { ownerId: 1, externalSystemId: 1, externalId: 'name:roze madder' },
        ],
        [fakeCoach],
      );

      await service.upsert({ name: 'Roze Madder', externalIds });

      expect(chains).toHaveLength(2);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing coach', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'id:47' }],
        [fakeCoach],
      );

      await service.upsert({ name: 'Roze Madder', externalIds });

      expect(chains).toHaveLength(3);
      expect(firstCallArg(chains[2].values)).toEqual([
        { coachId: 1, externalSystemId: 1, externalId: 'name:roze madder' },
      ]);
    });

    it('re-selects instead of updating when the payload carries no fields', async () => {
      // query 0: the external-id lookup matches coach 1; query 1: the
      // re-select of the untouched row (no update is issued at all).
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'id:47' }],
        [fakeCoach],
      );

      const result = await service.upsert({
        externalIds: [{ externalSystemId: 1, externalId: 'id:47' }],
      });

      expect(db.update).not.toHaveBeenCalled();
      expect(result).toEqual({ coach: fakeCoach, created: false });
      expect(chains).toHaveLength(2);
    });
  });

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

    it.each([
      ['countMatchesWonByCoach', 'won'],
      ['countMatchesLostByCoach', 'lost'],
      ['countMatchesDrawnByCoach', 'drawn'],
    ] as const)(
      '%s returns the rows the query resolves to',
      async (method, _outcome) => {
        const rows = [
          { coachId: 1, name: 'Roze Madder', count: 5 },
          { coachId: 2, name: 'Grashnak', count: 2 },
        ];
        const { db } = await build(rows);
        await expect(service[method](FACT_SCOPE_ALL_TIME, 21)).resolves.toEqual(
          rows,
        );
        expect(db.select).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      [
        'countMatchesWonByCoach',
        ['matches.winning_match_team_id', 'match_teams.id'],
      ],
      [
        'countMatchesLostByCoach',
        [
          'matches.winning_match_team_id',
          'matches.winning_match_team_id',
          'match_teams.id',
        ],
      ],
      ['countMatchesDrawnByCoach', ['matches.winning_match_team_id']],
    ] as const)(
      '%s forwards the era scope and limit to the outcome query',
      async (method, expectedOutcomeColumns) => {
        const { chains } = await build([]);
        await service[method]({ eraId: 20 }, 21);
        expect(chains[0].where).toHaveBeenCalledTimes(1);
        expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
          20,
        ]);
        expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
          ...expectedOutcomeColumns,
          'team_eras.era_id',
        ]);
        expect(chains[0].limit).toHaveBeenCalledWith(21);
      },
    );

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

    it('countFoulsCommittedByCoach returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 13 },
        { coachId: 2, name: 'Grashnak', count: 4 },
      ];
      const { db } = await build(rows);
      await expect(
        service.countFoulsCommittedByCoach(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('countFoulsCommittedByCoach filters on foul events and forwards league, era and limit', async () => {
      const { chains } = await build([]);
      await service.countFoulsCommittedByCoach({ leagueId: 9, eraId: 20 }, 21);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'foul',
        9,
        20,
      ]);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('countFoulsCommittedByCoach ignores a competition scope', async () => {
      // Coach toplists are league/era-scoped only (see the design doc): the
      // competitionId must not reach the query even though the shared helper
      // would accept it.
      const { chains } = await build([]);
      await service.countFoulsCommittedByCoach(
        { eraId: 20, competitionId: 30 },
        21,
      );
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'foul',
        20,
      ]);
    });

    it('countFoulsCommittedByCoach joins coaches through teams', async () => {
      const { chains } = await build([]);
      await service.countFoulsCommittedByCoach(FACT_SCOPE_ALL_TIME, 21);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 5, 1)),
      ).toEqual(['coaches.id', 'teams.coach_id']);
    });

    it('countFoulsCommittedByCoach filters by the match category in the scope', async () => {
      const { chains } = await build([]);
      await service.countFoulsCommittedByCoach(
        { category: 'season_final' },
        21,
      );
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toContain(
        'season_final',
      );
    });

    it('countFoulsCommittedByCoach still ignores a competition in the scope', async () => {
      const { chains } = await build([]);
      await service.countFoulsCommittedByCoach({ competitionId: 30 }, 21);
      expect(
        extractAllFilterValues(firstCallArg(chains[0].where)),
      ).not.toContain(30);
    });

    it('countMatchesPlayedByCoach filters by the match category', async () => {
      const { chains } = await build([]);
      await service.countMatchesPlayedByCoach({ category: 'season_final' }, 21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'season_final',
      ]);
    });

    it('the time-between-matches subquery only sees matches of the given category', async () => {
      const { chains } = await build([], [], []);
      await service.getAverageGapBetweenMatchesByCoach(
        { category: 'season_final' },
        21,
      );
      // chains[0] is the inner selectDistinct that feeds the window function.
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
      // The service returns whatever the query yields; ranking/tie-cutoff is the
      // resolver's job (Task 5). This asserts the limit is passed through so a
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
    const gapRows = [
      { coachId: 1, name: 'Roze Madder', count: 91 },
      { coachId: 2, name: 'Grashnak', count: 34 },
    ];

    // Three builders are issued per call: the distinct match list, the
    // LAG() gap subquery, and the outer aggregate that is awaited.
    it('getGapBetweenMatchesByCoachDescending returns the rows the outer query resolves to', async () => {
      const { db, chains } = await build([], [], gapRows);
      await expect(
        service.getGapBetweenMatchesByCoachDescending(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(gapRows);
      expect(db.selectDistinct).toHaveBeenCalledTimes(1);
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(chains[2].limit).toHaveBeenCalledWith(21);
    });

    it('computes each gap with a LAG window function partitioned by coach and ordered by match date', async () => {
      const { db } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachDescending(
        FACT_SCOPE_ALL_TIME,
        21,
      );
      const gapFields = firstCallArg(db.select, 0, 0) as { gapDays: unknown };
      const text = sqlText(gapFields.gapDays);
      expect(text).toContain('lag(');
      expect(text).toContain('over (partition by');
      expect(text).toContain('order by');
    });

    it('deduplicates a coach match list so a coach with two teams in one match is not double-counted', async () => {
      const { db } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachDescending(
        FACT_SCOPE_ALL_TIME,
        21,
      );
      const matchFields = firstCallArg(db.selectDistinct, 0, 0) as {
        coachId: unknown;
        name: unknown;
        playedAt: unknown;
      };
      expect(matchFields.playedAt).toBeDefined();
    });

    it('excludes a coach first match, so coaches with fewer than two matches in scope drop out', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachDescending(
        FACT_SCOPE_ALL_TIME,
        21,
      );
      expect(sqlText(firstCallArg(chains[2].where))).toContain('is not null');
    });

    it('ranks the largest gap first, rounded to whole days', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachDescending(
        FACT_SCOPE_ALL_TIME,
        21,
      );
      const orderBy = sqlText(firstCallArg(chains[2].orderBy));
      expect(orderBy).toContain('max(');
      expect(orderBy).toContain('round(');
      expect(orderBy).toContain(' desc');
    });

    it('getGapBetweenMatchesByCoachAscending ranks the same longest-gap metric ascending', async () => {
      const { chains } = await build([], [], gapRows);
      await expect(
        service.getGapBetweenMatchesByCoachAscending(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(gapRows);
      const orderBy = sqlText(firstCallArg(chains[2].orderBy));
      expect(orderBy).toContain('max(');
      expect(orderBy).toContain(' asc');
      expect(orderBy).not.toContain(' desc');
    });

    it('getGapBetweenMatchesByCoachAscending requires at least 4 gaps (5 matches)', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachAscending(
        FACT_SCOPE_ALL_TIME,
        21,
      );
      const having = sqlText(firstCallArg(chains[2].having));
      expect(having).toContain('count(');
      expect(having).toContain('>= 4');
    });

    it('getGapBetweenMatchesByCoachDescending does not apply a minimum-matches floor', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachDescending(
        FACT_SCOPE_ALL_TIME,
        21,
      );
      expect(chains[2].having).not.toHaveBeenCalled();
    });

    it('applies no filter when the scope is all-time', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachDescending(
        FACT_SCOPE_ALL_TIME,
        21,
      );
      expect(firstCallArg(chains[0].where)).toBeUndefined();
    });

    it('filters the match list by era when an eraId is given', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachDescending({ eraId: 20 }, 21);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'matches.id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
    });

    it('filters the match list by league via the eras join', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getGapBetweenMatchesByCoachAscending({ leagueId: 9 }, 21);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('getAverageGapBetweenMatchesByCoach returns the rows the outer query resolves to', async () => {
      const averageRows = [
        { coachId: 2, name: 'Grashnak', count: 7 },
        { coachId: 1, name: 'Roze Madder', count: 30 },
      ];
      const { db, chains } = await build([], [], averageRows);
      await expect(
        service.getAverageGapBetweenMatchesByCoach(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(averageRows);
      expect(db.selectDistinct).toHaveBeenCalledTimes(1);
      expect(db.select).toHaveBeenCalledTimes(2);
      expect(chains[2].limit).toHaveBeenCalledWith(21);
    });

    it('ranks the smallest average gap first, rounded to whole days', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getAverageGapBetweenMatchesByCoach(FACT_SCOPE_ALL_TIME, 21);
      const orderBy = sqlText(firstCallArg(chains[2].orderBy));
      expect(orderBy).toContain('avg(');
      expect(orderBy).toContain('round(');
      expect(orderBy).toContain(' asc');
      expect(orderBy).not.toContain(' desc');
    });

    it('averages only real gaps, excluding each coach first match', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getAverageGapBetweenMatchesByCoach(FACT_SCOPE_ALL_TIME, 21);
      expect(sqlText(firstCallArg(chains[2].where))).toContain('is not null');
    });

    it('filters the average by era when an eraId is given', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getAverageGapBetweenMatchesByCoach({ eraId: 20 }, 21);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
    });

    it('filters the average by league when a leagueId is given', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getAverageGapBetweenMatchesByCoach({ leagueId: 9 }, 21);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('getAverageGapBetweenMatchesByCoach requires at least 4 gaps (5 matches)', async () => {
      const { chains } = await build([], [], gapRows);
      await service.getAverageGapBetweenMatchesByCoach(FACT_SCOPE_ALL_TIME, 21);
      const having = sqlText(firstCallArg(chains[2].having));
      expect(having).toContain('count(');
      expect(having).toContain('>= 4');
    });
  });
});
