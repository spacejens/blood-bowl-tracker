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

  describe('searchByNamePrefix', () => {
    it('returns trophies with their competition group name, ordered by name and limited', async () => {
      const rows = [
        { id: 7, name: 'Chaos Cup', competitionGroupName: 'Major' },
        { id: 9, name: 'Chaos Shield', competitionGroupName: 'Minor' },
      ];
      likePattern.escape.mockReturnValue('cha');
      const { chains } = await build(rows);

      await expect(service.searchByNamePrefix('cha', 25)).resolves.toEqual(
        rows,
      );

      expect(chains[0].limit).toHaveBeenCalledWith(25);
      expect(chains[0].orderBy).toHaveBeenCalledWith(trophies.name);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
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
  });

  describe('findById', () => {
    it('returns the trophy header joined to its competition group', async () => {
      const header = {
        id: 7,
        name: 'Chaos Cup',
        description: 'The team that wins after four matches.',
        competitionGroupName: 'Major',
      };
      const { chains } = await build([header]);

      await expect(service.findById(7)).resolves.toEqual(header);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when no trophy has that id', async () => {
      await build([]);

      await expect(service.findById(999)).resolves.toBeUndefined();
    });
  });
});
