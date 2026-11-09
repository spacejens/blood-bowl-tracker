import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  matches,
  matchExternalIds,
  matchTeams,
} from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { firstCallArg, mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  MatchCategoryMismatchError,
  MatchesService,
  MatchUpsertConflictError,
} from './matches.service';

const fakeMatch = {
  id: 1,
  competitionId: 20,
  playedAt: new Date('2021-09-25'),
  name: 'Final',
  createdAt: new Date('2026-01-01'),
};

describe('MatchesService', () => {
  let service: MatchesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [MatchesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(MatchesService);
    return { db, chains };
  }

  const baseData = {
    competitionId: 20,
    playedAt: new Date('2021-09-25'),
    name: 'Final',
    category: 'normal' as const,
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [] as number[],
  };

  describe('upsert', () => {
    it('creates a new match when no external IDs match', async () => {
      // query 0: competition-type lookup for the category check; query 1:
      // external-id lookup finds nothing; query 2: the insert returns the
      // row; query 3: the one external ID is new and gets inserted; query 4:
      // no team-era links to sync (teamEraIds is empty).
      const { db, chains } = await build([{ type: 'season' }], [], [fakeMatch]);

      const result = await service.upsert(baseData);

      expect(result).toEqual({
        match: { ...fakeMatch, teamEraIds: [] },
        created: true,
      });
      expect(chains).toHaveLength(5);
      expect(db.insert).toHaveBeenCalledWith(matches);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts the match with its competitionId and playedAt', async () => {
      const { chains } = await build([{ type: 'season' }], [], [fakeMatch]);

      await service.upsert(baseData);

      expect(firstCallArg(chains[2].values)).toEqual({
        competitionId: 20,
        playedAt: new Date('2021-09-25'),
        name: 'Final',
        category: 'normal',
      });
    });

    it('updates the matching match when exactly one external ID matches', async () => {
      // query 0: competition-type lookup for the category check; query 1:
      // external-id lookup finds one owner; query 2: the update returns the
      // row; the external ID already exists, so no join-table insert; query
      // 3: no team-era links to sync.
      const { db, chains } = await build(
        [{ type: 'season' }],
        [{ ownerId: 1, externalSystemId: 1, externalId: '89' }],
        [fakeMatch],
      );

      const result = await service.upsert(baseData);

      expect(result.created).toBe(false);
      expect(chains).toHaveLength(4);
      expect(db.update).toHaveBeenCalledWith(matches);
      expect(firstCallArg(chains[2].set)).toEqual({
        competitionId: 20,
        playedAt: new Date('2021-09-25'),
        name: 'Final',
        category: 'normal',
      });
    });

    it('throws MatchUpsertConflictError when external IDs match different matches', async () => {
      const { db, chains } = await build(
        [{ type: 'season' }],
        [
          { ownerId: 1, externalSystemId: 1, externalId: '89' },
          { ownerId: 2, externalSystemId: 1, externalId: '90' },
        ],
      );

      await expect(service.upsert(baseData)).rejects.toThrow(
        MatchUpsertConflictError,
      );
      expect(chains).toHaveLength(2);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts only the external-id pairs that are new', async () => {
      const { chains } = await build(
        [{ type: 'season' }],
        [{ ownerId: 1, externalSystemId: 1, externalId: '89' }],
        [fakeMatch],
      );

      await service.upsert({
        ...baseData,
        externalIds: [
          { externalSystemId: 1, externalId: '89' },
          { externalSystemId: 2, externalId: '90' },
        ],
      });

      expect(chains).toHaveLength(5);
      expect(firstCallArg(chains[3].values)).toEqual([
        { matchId: 1, externalSystemId: 2, externalId: '90' },
      ]);
    });

    it('does not insert external-id rows when all pairs already exist', async () => {
      const { db, chains } = await build(
        [{ type: 'season' }],
        [{ ownerId: 1, externalSystemId: 1, externalId: '89' }],
        [fakeMatch],
      );

      await service.upsert(baseData);

      expect(chains).toHaveLength(4);
      expect(db.insert).not.toHaveBeenCalledWith(matchExternalIds);
    });

    it('inserts only the match_teams rows that are new', async () => {
      const { chains } = await build(
        [{ type: 'season' }],
        [],
        [fakeMatch],
        [],
        [{ teamEraId: 100 }],
      );

      const result = await service.upsert({
        ...baseData,
        teamEraIds: [100, 101],
      });

      expect(chains).toHaveLength(6);
      expect(firstCallArg(chains[5].values)).toEqual([
        { matchId: 1, teamEraId: 101 },
      ]);
      expect(result.match.teamEraIds).toEqual([100, 101]);
    });

    it('does not insert match_teams rows when all links already exist', async () => {
      const { db, chains } = await build(
        [{ type: 'season' }],
        [],
        [fakeMatch],
        [],
        [{ teamEraId: 100 }, { teamEraId: 101 }],
      );

      const result = await service.upsert({
        ...baseData,
        teamEraIds: [100, 101],
      });

      expect(chains).toHaveLength(5);
      expect(db.insert).not.toHaveBeenCalledWith(matchTeams);
      expect(result.match.teamEraIds).toEqual([100, 101]);
    });

    it('updates only the supplied column, leaving competitionId and playedAt alone', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '89' }],
        [fakeMatch],
      );

      await service.upsert({
        name: 'Semi-final',
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
      });

      expect(firstCallArg(chains[1].set)).toEqual({ name: 'Semi-final' });
    });

    it('writes the category through to the insert values', async () => {
      const { chains } = await build([{ type: 'season' }], [], [fakeMatch]);

      await service.upsert({
        competitionId: 3,
        playedAt: new Date('2026-06-13T00:00:00Z'),
        name: 'Final',
        category: 'season_final',
        externalIds: [{ externalSystemId: 1, externalId: '1830' }],
        teamEraIds: [],
      });

      expect(firstCallArg(chains[2].values)).toEqual(
        expect.objectContaining({ category: 'season_final' }),
      );
    });
  });

  describe('category/competition-type validation', () => {
    it('rejects cup_final on a season competition', async () => {
      const { db } = await build([{ type: 'season' }]);

      await expect(
        service.upsert({
          competitionId: 3,
          category: 'cup_final',
          externalIds: [{ externalSystemId: 1, externalId: '1830' }],
          teamEraIds: [],
        }),
      ).rejects.toBeInstanceOf(MatchCategoryMismatchError);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it.each([
      ['season_final'],
      ['season_semi_final'],
      ['season_bronze'],
      ['season_qualifier'],
    ] as const)('rejects %s on a cup competition', async (category) => {
      await build([{ type: 'cup' }]);

      await expect(
        service.upsert({
          competitionId: 3,
          category,
          externalIds: [{ externalSystemId: 1, externalId: '1830' }],
          teamEraIds: [],
        }),
      ).rejects.toBeInstanceOf(MatchCategoryMismatchError);
    });

    it('allows normal on either competition type', async () => {
      for (const type of ['season', 'cup'] as const) {
        await build([{ type }], [], [fakeMatch]);

        await expect(
          service.upsert({
            competitionId: 3,
            playedAt: new Date('2021-09-25'),
            name: 'Final',
            category: 'normal',
            externalIds: [{ externalSystemId: 1, externalId: '1830' }],
            teamEraIds: [],
          }),
        ).resolves.toBeDefined();
      }
    });

    it('throws when the competition does not exist', async () => {
      await build([]);

      await expect(
        service.upsert({
          competitionId: 999,
          category: 'normal',
          externalIds: [{ externalSystemId: 1, externalId: '1830' }],
          teamEraIds: [],
        }),
      ).rejects.toThrow(/competition 999/);
    });

    it('skips the check when the payload carries no competitionId', async () => {
      // an overlay update naming only external ids: no competitionId in the
      // payload, so the first query issued is the external-id resolve, not
      // a competitions lookup.
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '1830' }],
        [fakeMatch],
      );

      await service.upsert({
        name: 'Final',
        category: 'cup_final',
        externalIds: [{ externalSystemId: 1, externalId: '1830' }],
        teamEraIds: [],
      });

      expect(chains).toHaveLength(3);
    });
  });
});
