import type { Db } from '@blood-bowl-tracker/db';
import { DB, trophies } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TrophiesService, TrophyUpsertConflictError } from './trophies.service';

const fakeTrophy = {
  id: 1,
  name: 'Chaos Cup',
  recipientKind: 'team' as const,
  description: 'The team that wins after four matches.',
  createdAt: new Date('2026-01-01'),
};

describe('TrophiesService', () => {
  let service: TrophiesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophiesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TrophiesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  const baseData = {
    name: 'Chaos Cup',
    recipientKind: 'team' as const,
    description: 'The team that wins after four matches.',
    externalIds: [{ externalSystemId: 1, externalId: 'Chaos Cup' }],
  };

  it('creates a new trophy when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert
    // returns the row; query 2: the one external ID is new and gets inserted.
    const { db, chains } = await build([], [fakeTrophy]);

    const result = await service.upsert(baseData);

    expect(result).toEqual({ trophy: fakeTrophy, created: true });
    expect(chains).toHaveLength(3);
    expect(db.insert).toHaveBeenCalledWith(trophies);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates the matching trophy when exactly one external ID matches', async () => {
    const { db } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' }],
      [fakeTrophy],
    );

    const result = await service.upsert(baseData);

    expect(result).toEqual({ trophy: fakeTrophy, created: false });
    expect(db.update).toHaveBeenCalledWith(trophies);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws TrophyUpsertConflictError when external IDs match two trophies', async () => {
    await build([
      { ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' },
      { ownerId: 2, externalSystemId: 2, externalId: 'other' },
    ]);

    await expect(
      service.upsert({
        ...baseData,
        externalIds: [
          { externalSystemId: 1, externalId: 'Chaos Cup' },
          { externalSystemId: 2, externalId: 'other' },
        ],
      }),
    ).rejects.toBeInstanceOf(TrophyUpsertConflictError);
  });

  it('matches an existing trophy by exact name when externalIds is empty', async () => {
    // query 0: the name lookup finds the existing row; query 1: the update.
    const { db, chains } = await build([fakeTrophy], [fakeTrophy]);

    const result = await service.upsert({
      name: 'Ogretoberfest',
      recipientKind: 'team',
      externalIds: [],
    });

    expect(result).toEqual({ trophy: fakeTrophy, created: false });
    expect(db.update).toHaveBeenCalledWith(trophies);
    expect(db.insert).not.toHaveBeenCalled();
    expect(chains).toHaveLength(2);
  });

  it('throws TrophyUpsertConflictError when the name lookup matches more than one trophy', async () => {
    const otherTrophy = { ...fakeTrophy, id: 2 };
    await build([fakeTrophy, otherTrophy]);

    await expect(
      service.upsert({
        name: 'Ogretoberfest',
        recipientKind: 'team',
        externalIds: [],
      }),
    ).rejects.toBeInstanceOf(TrophyUpsertConflictError);
  });

  it('creates a trophy when externalIds is empty and no name matches', async () => {
    const { db } = await build([], [fakeTrophy]);

    const result = await service.upsert({
      name: 'Ogretoberfest',
      recipientKind: 'team',
      externalIds: [],
    });

    expect(result).toEqual({ trophy: fakeTrophy, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophies);
  });

  it('throws when externalIds is empty and no name is supplied', async () => {
    await build();

    await expect(
      service.upsert({ recipientKind: 'team', externalIds: [] }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('writes competitionGroupId on the name-matched insert path', async () => {
    const { chains } = await build([], [{ id: 9 }]);

    await service.upsert({
      name: 'Major Gold',
      recipientKind: 'team',
      externalIds: [],
      competitionGroupId: 1,
    });

    expect(chains[1].values).toHaveBeenCalledWith(
      expect.objectContaining({ competitionGroupId: 1 }),
    );
  });

  it('throws when creating by name without a recipientKind', async () => {
    await build([]);

    await expect(
      service.upsert({ name: 'Brand New', externalIds: [] }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('writes the league id on the external-id upsert path', async () => {
    const { chains } = await build([], [{ ...fakeTrophy, leagueId: 7 }]);

    await service.upsert({
      ...baseData,
      competitionGroupId: null,
      leagueId: 7,
    });

    expect(firstCallArg(chains[1].values)).toMatchObject({
      competitionGroupId: null,
      leagueId: 7,
    });
  });

  it('writes the league id when matching an existing trophy by name', async () => {
    const { chains } = await build(
      [fakeTrophy],
      [{ ...fakeTrophy, leagueId: 7 }],
    );

    await service.upsert({
      name: 'Legendary Player',
      recipientKind: 'player',
      competitionGroupId: null,
      leagueId: 7,
      externalIds: [],
    });

    expect(firstCallArg(chains[1].set)).toMatchObject({
      competitionGroupId: null,
      leagueId: 7,
    });
  });

  it('writes the league id when creating a trophy by name', async () => {
    const { chains } = await build([], [{ ...fakeTrophy, leagueId: 7 }]);

    await service.upsert({
      name: 'Legendary Player',
      recipientKind: 'player',
      competitionGroupId: null,
      leagueId: 7,
      externalIds: [],
    });

    expect(firstCallArg(chains[1].values)).toMatchObject({
      competitionGroupId: null,
      leagueId: 7,
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns trophies with their competition group name, ordered by name and limited', async () => {
      const rows = [
        {
          id: 7,
          name: 'Chaos Cup',
          competitionGroupId: 4,
          competitionGroupName: 'Major',
          leagueName: null,
        },
        {
          id: 9,
          name: 'Chaos Shield',
          competitionGroupId: 5,
          competitionGroupName: 'Minor',
          leagueName: null,
        },
      ];
      likePattern.escape.mockReturnValue('cha');
      const { chains } = await build(rows);

      await expect(service.searchByNamePrefix('cha', 25)).resolves.toEqual(
        rows,
      );

      expect(chains[0].limit).toHaveBeenCalledWith(25);
      expect(chains[0].orderBy).toHaveBeenCalledWith(trophies.name);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
    });

    it('escapes LIKE metacharacters in the prefix before matching', async () => {
      likePattern.escape.mockReturnValue('50\\%\\_\\\\off');
      const { chains } = await build([]);

      await service.searchByNamePrefix('50%_\\off', 25);

      expect(likePattern.escape).toHaveBeenCalledWith('50%_\\off');
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      // The escaped pattern value is passed as a raw SQL parameter chunk.
      const condition = firstCallArg(chains[0].where) as {
        queryChunks: unknown[];
      };
      expect(condition.queryChunks).toContain('50\\%\\_\\\\off%');
    });

    it('returns both scope names from the prefix search', async () => {
      await build([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueName: 'tLoEG',
        },
      ]);

      expect(await service.searchByNamePrefix('Leg', 25)).toEqual([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueName: 'tLoEG',
        },
      ]);
    });
  });

  describe('findById', () => {
    it('returns the trophy header joined to its competition group', async () => {
      const header = {
        id: 7,
        name: 'Chaos Cup',
        description: 'The team that wins after four matches.',
        competitionGroupId: 4,
        competitionGroupName: 'Major',
        leagueId: null,
        leagueName: null,
      };
      const { chains } = await build([header]);

      await expect(service.findById(7)).resolves.toEqual(header);

      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when no trophy has that id', async () => {
      await build([]);

      await expect(service.findById(999)).resolves.toBeUndefined();
    });

    it('selects the competition group id so the deepdive can link to the group', async () => {
      const { db } = await build([]);

      await service.findById(1);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
        'description',
        'competitionGroupId',
        'competitionGroupName',
        'leagueId',
        'leagueName',
      ]);
    });

    it('resolves a league-scoped trophy header through the league join', async () => {
      const { chains } = await build([
        {
          id: 3,
          name: 'Legendary Player',
          description: null,
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);

      const header = await service.findById(3);

      expect(header).toMatchObject({ leagueId: 7, leagueName: 'tLoEG' });
      // Both scope joins are outer, so a row with either scope survives.
      expect(chains[0].leftJoin).toHaveBeenCalledTimes(2);
      expect(chains[0].innerJoin).not.toHaveBeenCalled();
    });
  });

  describe('listByCompetitionGroup', () => {
    it('returns the id and name of every trophy the group awards, ordered by name', async () => {
      const rows = [
        { id: 3, name: '1st place' },
        { id: 4, name: 'Most casualties' },
      ];
      const { db, chains } = await build(rows);

      await expect(service.listByCompetitionGroup(4)).resolves.toEqual(rows);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
      ]);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(4);
      expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when the group awards no trophies', async () => {
      await build([]);

      await expect(service.listByCompetitionGroup(4)).resolves.toEqual([]);
    });
  });

  describe('listAllWithLeague', () => {
    const rows = [
      {
        id: 1,
        name: 'Chaos Cup',
        competitionGroupId: 3,
        competitionGroupName: 'Chaos Cup',
        leagueId: null,
        leagueName: null,
      },
      {
        id: 2,
        name: '1st',
        competitionGroupId: 4,
        competitionGroupName: 'Major Season',
        leagueId: null,
        leagueName: null,
      },
    ];

    it('returns the rows the query resolves to and outer-joins trophies to competition groups and leagues', async () => {
      const { db, chains } = await build(rows);
      await expect(service.listAllWithLeague({})).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
      expect(chains[0].innerJoin).not.toHaveBeenCalled();
    });

    it("filters by either the competition group's league id or the trophy's own when the scope carries a leagueId", async () => {
      const { chains } = await build(rows);
      await service.listAllWithLeague({ leagueId: 42 });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        42, 42,
      ]);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'competition_groups.league_id',
        'trophies.league_id',
      ]);
    });

    it('applies no league filter when the scope has no leagueId', async () => {
      const { chains } = await build(rows);
      await service.listAllWithLeague({});
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(firstCallArg(chains[0].where)).toBeUndefined();
    });

    it('resolves to an empty list when the catalog is empty', async () => {
      await build([]);
      await expect(service.listAllWithLeague({})).resolves.toEqual([]);
    });

    it('includes league-scoped trophies when scoping the catalog to a league', async () => {
      const { chains } = await build([]);

      await service.listAllWithLeague({ leagueId: 7 });

      // The filter is an OR over the group's league and the trophy's own,
      // so the league id appears on both sides.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        7, 7,
      ]);
    });

    it('applies no filter to the catalog when the scope is all-time', async () => {
      const { chains } = await build([]);

      await service.listAllWithLeague({});

      expect(firstCallArg(chains[0].where)).toBeUndefined();
    });

    it('returns the trophy catalog with both scope names', async () => {
      await build([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);

      expect(await service.listAllWithLeague({})).toEqual([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);
    });
  });

  describe('listByLeague', () => {
    it('lists trophies scoped directly to one league, ordered by name', async () => {
      const { chains } = await build([
        { id: 3, name: 'Legendary Player' },
        { id: 4, name: 'Trogen Tjänst' },
      ]);

      const rows = await service.listByLeague(7);

      expect(rows).toEqual([
        { id: 3, name: 'Legendary Player' },
        { id: 4, name: 'Trogen Tjänst' },
      ]);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      expect(chains[0].orderBy).toHaveBeenCalled();
    });
  });
});
