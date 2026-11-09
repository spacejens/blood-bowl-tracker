import { DB } from '@blood-bowl-tracker/db';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { CompetitionGroupsQueriesService } from './competition-groups-queries.service';

async function makeService(...rowsPerQuery: unknown[][]) {
  const db = mockDb(...rowsPerQuery);
  const likePattern = mock<LikePatternService>();
  likePattern.escape.mockImplementation((value: string) => value);
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionGroupsQueriesService,
      { provide: DB, useValue: db.db },
      { provide: LikePatternService, useValue: likePattern },
    ],
  }).compile();
  return {
    service: moduleRef.get(CompetitionGroupsQueriesService),
    db,
    likePattern,
  };
}

describe('CompetitionGroupsQueriesService', () => {
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

  it('counts every competition group', async () => {
    const { service } = await makeService([{ count: 14 }]);

    await expect(service.countAll()).resolves.toBe(14);
  });

  it('counts the competition groups of one league', async () => {
    const { service, db } = await makeService([{ count: 5 }]);

    await expect(service.countByLeague(9)).resolves.toBe(5);

    expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(9);
    expect(extractJoinColumns(firstCallArg(db.chains[0].where))).toEqual([
      'competition_groups.league_id',
    ]);
  });

  it('counts the distinct competition groups that have a competition in an era', async () => {
    const { service, db } = await makeService([{ count: 3 }]);

    await expect(service.countByEra(5)).resolves.toBe(3);

    expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(5);
    expect(extractJoinColumns(firstCallArg(db.chains[0].where))).toEqual([
      'competitions.era_id',
    ]);
  });
});
