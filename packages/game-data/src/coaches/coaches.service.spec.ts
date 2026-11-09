import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { firstCallArg, mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { CoachesService, CoachUpsertConflictError } from './coaches.service';

const fakeCoach = {
  id: 1,
  name: 'Roze Madder',
  createdAt: new Date('2026-01-01'),
};

describe('CoachesService', () => {
  let service: CoachesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [CoachesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(CoachesService);
    return { db, chains };
  }

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

      const result = await service.upsert({
        name: 'Roze Madder',
        renameExisting: true,
        externalIds,
      });

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

      await service.upsert({
        name: 'Roze Madder',
        renameExisting: true,
        externalIds,
      });

      expect(chains).toHaveLength(2);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing coach', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'id:47' }],
        [fakeCoach],
      );

      await service.upsert({
        name: 'Roze Madder',
        renameExisting: true,
        externalIds,
      });

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

    it('keeps the stored name when an update does not ask to rename', async () => {
      // query 0: the lookup matches coach 1; query 1: re-select of the
      // untouched row. No UPDATE, so no history row and no updated_at bump.
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'id:47' }],
        [fakeCoach],
      );

      const result = await service.upsert({
        name: 'Raw Source Name',
        externalIds: [{ externalSystemId: 1, externalId: 'id:47' }],
      });

      expect(db.update).not.toHaveBeenCalled();
      expect(chains).toHaveLength(2);
      expect(result).toEqual({ coach: fakeCoach, created: false });
    });

    it('creates with the payload name even without a rename intent', async () => {
      const { chains } = await build([], [fakeCoach]);

      await service.upsert({ name: 'Roze Madder', externalIds });

      expect(firstCallArg(chains[1].values)).toEqual({ name: 'Roze Madder' });
    });
  });
});
