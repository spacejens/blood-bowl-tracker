import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { firstCallArg, mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { LeaguesService, LeagueUpsertConflictError } from './leagues.service';

const fakeLeague = {
  id: 1,
  name: 'Test League',
  createdAt: new Date('2026-01-01'),
};

describe('LeaguesService', () => {
  let service: LeaguesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [LeaguesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(LeaguesService);
    return { db, chains };
  }

  describe('upsert', () => {
    const externalIds = [
      { externalSystemId: 1, externalId: 'Test League' },
      { externalSystemId: 2, externalId: 'Test League' },
    ];

    it('creates a new league when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: both external IDs are new and get
      // inserted.
      const { db, chains } = await build([], [fakeLeague]);

      const result = await service.upsert({ name: 'Test League', externalIds });

      expect(result).toEqual({ league: fakeLeague, created: true });
      expect(chains).toHaveLength(3);
      expect(db.insert).toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('updates the matching league when exactly one external ID matches', async () => {
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Test League' }],
        [fakeLeague],
      );

      const result = await service.upsert({ name: 'Test League', externalIds });

      expect(result).toEqual({ league: fakeLeague, created: false });
      expect(chains).toHaveLength(3);
      expect(db.update).toHaveBeenCalled();
    });

    it('throws LeagueUpsertConflictError when external IDs match different leagues', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: 'Test League' },
        { ownerId: 2, externalSystemId: 2, externalId: 'Test League' },
      ]);

      await expect(
        service.upsert({ name: 'Test League', externalIds }),
      ).rejects.toThrow(LeagueUpsertConflictError);
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched league', async () => {
      const { db, chains } = await build(
        [
          { ownerId: 1, externalSystemId: 1, externalId: 'Test League' },
          { ownerId: 1, externalSystemId: 2, externalId: 'Test League' },
        ],
        [fakeLeague],
      );

      await service.upsert({ name: 'Test League', externalIds });

      expect(chains).toHaveLength(2);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing league', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Test League' }],
        [fakeLeague],
      );

      await service.upsert({ name: 'Test League', externalIds });

      expect(chains).toHaveLength(3);
      expect(firstCallArg(chains[2].values)).toEqual([
        { leagueId: 1, externalSystemId: 2, externalId: 'Test League' },
      ]);
    });

    it('re-selects instead of updating when the payload carries no fields', async () => {
      // query 0: the external-id lookup matches league 1; query 1: the
      // re-select of the untouched row (no update is issued at all).
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Test League' }],
        [fakeLeague],
      );

      const result = await service.upsert({
        externalIds: [{ externalSystemId: 1, externalId: 'Test League' }],
      });

      expect(db.update).not.toHaveBeenCalled();
      expect(result).toEqual({ league: fakeLeague, created: false });
      expect(chains).toHaveLength(2);
    });
  });
});
