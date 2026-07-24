import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { LeaguesService, LeagueUpsertConflictError } from './leagues.service';

const fakeLeague = {
  id: 1,
  name: 'Test League',
  createdAt: new Date('2026-01-01'),
};

describe('LeaguesService', () => {
  let service: LeaguesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaguesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(LeaguesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

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
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.insert).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
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
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
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
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.insert).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
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
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
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
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { chains } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(chains[0].from).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('returns the matching league id and name', async () => {
      const { chains } = await build([{ id: 7, name: 'GBBL' }]);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'GBBL',
      });
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('returns undefined when no league matches', async () => {
      const { chains } = await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(999);
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns leagues matching the prefix, limited', async () => {
      const rows = [
        { id: 1, name: 'GBBL' },
        { id: 2, name: 'GBBL North' },
      ];
      likePattern.escape.mockReturnValue('GBBL');
      const { chains } = await build(rows);
      await expect(service.searchByNamePrefix('GBBL', 25)).resolves.toEqual(
        rows,
      );
      expect(chains[0].limit).toHaveBeenCalledWith(25);
    });

    it('escapes LIKE metacharacters in the prefix before matching', async () => {
      likePattern.escape.mockReturnValue('50\\%\\_\\\\off');
      const { chains } = await build([]);

      await service.searchByNamePrefix('50%_\\off', 25);

      expect(chains[0].where).toHaveBeenCalledTimes(1);
      // The escaped pattern value is passed as a raw SQL parameter chunk.
      const condition = firstCallArg(chains[0].where) as {
        queryChunks: unknown[];
      };
      expect(condition.queryChunks).toContain('50\\%\\_\\\\off%');
    });
  });
});
