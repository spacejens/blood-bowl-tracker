import { competitionGroups, DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  CompetitionGroupsService,
  CompetitionGroupUpsertConflictError,
} from './competition-groups.service';

const externalIds = [{ externalSystemId: 2, externalId: 'Chaos Cup' }];

async function makeService(...rowsPerQuery: unknown[][]) {
  const db = mockDb(...rowsPerQuery);
  const likePattern = mock<LikePatternService>();
  likePattern.escape.mockImplementation((value: string) => value);
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionGroupsService,
      { provide: DB, useValue: db.db },
      { provide: LikePatternService, useValue: likePattern },
    ],
  }).compile();
  return {
    service: moduleRef.get(CompetitionGroupsService),
    db,
    likePattern,
  };
}

describe('CompetitionGroupsService', () => {
  it('inserts a new group when no external id matches', async () => {
    const row = { id: 7, name: 'Chaos Cup', leagueId: 2 };
    // query 0: external-id lookup finds nothing; query 1: the insert returns
    // the row; query 2: the new external id is inserted.
    const { service, db } = await makeService([], [row]);

    const result = await service.upsert({
      name: 'Chaos Cup',
      leagueId: 2,
      externalIds,
    });

    expect(result).toEqual({ competitionGroup: row, created: true });
    expect(db.db.insert).toHaveBeenCalled();
    expect(db.db.update).not.toHaveBeenCalled();
  });

  it('updates the matching group when exactly one external id matches', async () => {
    const updated = { id: 7, name: 'Chaos Cup', leagueId: 3 };
    const { service, db } = await makeService(
      [{ ownerId: 7, externalSystemId: 2, externalId: 'Chaos Cup' }],
      [updated],
    );

    const result = await service.upsert({
      name: 'Chaos Cup',
      leagueId: 3,
      externalIds,
    });

    expect(result).toEqual({ competitionGroup: updated, created: false });
    expect(db.chains[1].set).toHaveBeenCalledWith({
      name: 'Chaos Cup',
      leagueId: 3,
    });
  });

  it('throws a conflict error when external ids match different groups', async () => {
    const { service } = await makeService([
      { ownerId: 1, externalSystemId: 2, externalId: 'Chaos Cup' },
      { ownerId: 2, externalSystemId: 3, externalId: 'Chaos Cup' },
    ]);

    await expect(
      service.upsert({ name: 'Chaos Cup', leagueId: 2, externalIds }),
    ).rejects.toBeInstanceOf(CompetitionGroupUpsertConflictError);
  });

  it('lists every competition group in the API contract shape', async () => {
    const rows = [
      {
        id: 1,
        name: 'Major Season',
        leagueId: 1,
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 2,
        name: 'Chaos Cup',
        leagueId: 1,
        createdAt: new Date('2026-01-02'),
      },
    ];
    const { service, db } = await makeService(rows);

    await expect(service.listAllForApi()).resolves.toEqual(rows);
    expect(db.chains[0].from).toHaveBeenCalledWith(competitionGroups);
    expect(
      Object.keys(firstCallArg(db.db.select) as Record<string, unknown>).sort(),
    ).toEqual(['createdAt', 'id', 'leagueId', 'name']);
  });

  it('lists the competition groups of one league, ordered by name', async () => {
    const { service, db } = await makeService([
      { id: 1, name: 'Chaos Cup' },
      { id: 2, name: 'Major Season' },
    ]);

    const rows = await service.listByLeague(7);

    expect(rows).toEqual([
      { id: 1, name: 'Chaos Cup' },
      { id: 2, name: 'Major Season' },
    ]);
    expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(7);
    expect(db.chains[0].orderBy).toHaveBeenCalled();
  });

  describe('findByIdWithLeague', () => {
    it('returns the group joined with its league name', async () => {
      const row = {
        id: 7,
        name: 'Chaos Cup',
        leagueId: 2,
        leagueName: 'The Major',
      };
      const { service, db } = await makeService([row]);

      await expect(service.findByIdWithLeague(7)).resolves.toEqual(row);
      expect(
        extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 0, 1)),
      ).toEqual(['leagues.id', 'competition_groups.league_id']);
      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(7);
    });

    it('selects the league id so callers can scope from it', async () => {
      const { service, db } = await makeService([]);

      await service.findByIdWithLeague(7);
      expect(Object.keys(firstCallArg(db.db.select) as object)).toEqual([
        'id',
        'name',
        'leagueId',
        'leagueName',
      ]);
    });

    it('returns undefined when no group matches', async () => {
      const { service } = await makeService([]);

      await expect(service.findByIdWithLeague(999)).resolves.toBeUndefined();
    });
  });

  describe('listAllWithLeagueAndCount', () => {
    const rows = [
      {
        id: 1,
        name: 'Major Season',
        leagueName: 'Premier',
        competitionCount: 3,
      },
    ];

    it('returns the rows the query resolves to, joining to leagues and competitions', async () => {
      const { service, db } = await makeService(rows);
      await expect(service.listAllWithLeagueAndCount({})).resolves.toEqual(
        rows,
      );
      expect(db.db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 0, 1)),
      ).toEqual(['leagues.id', 'competition_groups.league_id']);
      expect(
        extractJoinColumns(firstCallArg(db.chains[0].leftJoin, 0, 1)),
      ).toEqual(['competitions.competition_group_id', 'competition_groups.id']);
    });

    it('groups by competition group id and league name', async () => {
      const { service, db } = await makeService(rows);
      await service.listAllWithLeagueAndCount({});
      expect(db.chains[0].groupBy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
      );
    });

    it('filters by league id when the scope carries a leagueId', async () => {
      const { service, db } = await makeService(rows);
      await service.listAllWithLeagueAndCount({ leagueId: 42 });
      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(42);
    });

    it('applies no league filter when the scope has no leagueId', async () => {
      const { service, db } = await makeService(rows);
      await service.listAllWithLeagueAndCount({});
      expect(db.chains[0].where).toHaveBeenCalledTimes(1);
      expect(firstCallArg(db.chains[0].where)).toBeUndefined();
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns groups joined to their league name, capped at the limit', async () => {
      const rows = [{ id: 7, name: 'Chaos Cup', leagueName: 'The Major' }];
      const { service, db } = await makeService(rows);

      await expect(service.searchByNamePrefix('Cha', 25)).resolves.toEqual(
        rows,
      );
      expect(db.chains[0].limit).toHaveBeenCalledWith(25);
      expect(db.chains[0].orderBy).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 0, 1)),
      ).toEqual(['leagues.id', 'competition_groups.league_id']);
    });

    it('escapes LIKE metacharacters in the prefix', async () => {
      const { service, db, likePattern } = await makeService([]);
      likePattern.escape.mockReturnValue('50\\%\\_x');

      await service.searchByNamePrefix('50%_x', 10);

      expect(likePattern.escape).toHaveBeenCalledWith('50%_x');
      // ilike() embeds its pattern as a raw string chunk rather than a Param,
      // so extractFilterValues (which only reads Param chunks) can't reach it;
      // read the raw string chunk directly.
      const condition = firstCallArg(db.chains[0].where) as {
        queryChunks: unknown[];
      };
      const pattern = condition.queryChunks.find(
        (chunk): chunk is string => typeof chunk === 'string',
      );
      expect(pattern).toBe('50\\%\\_x%');
    });
  });
});
