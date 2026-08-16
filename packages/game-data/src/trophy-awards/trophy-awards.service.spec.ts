import type { Db } from '@blood-bowl-tracker/db';
import { DB, trophyAwards } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  TrophyAwardRecipientMismatchError,
  TrophyAwardsService,
  TrophyAwardUpsertConflictError,
} from './trophy-awards.service';

const teamAwardRow = {
  id: 10,
  trophyId: 1,
  competitionId: 2,
  teamEraId: 3,
  playerId: null,
  createdAt: new Date('2026-01-01'),
};

const playerAwardRow = { ...teamAwardRow, id: 11, playerId: 4 };

const teamAward = {
  trophyId: 1,
  competitionId: 2,
  teamEraId: 3,
  playerId: null,
};

const playerAward = { ...teamAward, playerId: 4 };

describe('TrophyAwardsService', () => {
  let service: TrophyAwardsService;

  /**
   * `rowsPerQuery[0]` is always the trophy lookup (its `recipientKind`),
   * `rowsPerQuery[1]` the dedup lookup, `rowsPerQuery[2]` the insert.
   */
  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [TrophyAwardsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(TrophyAwardsService);
    return { db, chains };
  }

  it('inserts a team award when no matching row exists', async () => {
    const { db, chains } = await build(
      [{ recipientKind: 'team' }],
      [],
      [teamAwardRow],
    );

    const result = await service.upsert(teamAward);

    expect(result).toEqual({ trophyAward: teamAwardRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
    expect(chains).toHaveLength(3);
  });

  it('inserts a player award when no matching row exists', async () => {
    const { db } = await build(
      [{ recipientKind: 'player' }],
      [],
      [playerAwardRow],
    );

    const result = await service.upsert(playerAward);

    expect(result).toEqual({ trophyAward: playerAwardRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
  });

  it('returns the existing row without inserting when one already matches', async () => {
    const { db } = await build([{ recipientKind: 'team' }], [teamAwardRow]);

    const result = await service.upsert(teamAward);

    expect(result).toEqual({ trophyAward: teamAwardRow, created: false });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('records a tie as a second row for the same trophy and competition', async () => {
    // A tie is a different playerId, so the dedup lookup finds nothing and a
    // second row is inserted for the same trophy + competition.
    const tiedRow = { ...playerAwardRow, id: 12, playerId: 5 };
    const { db } = await build([{ recipientKind: 'player' }], [], [tiedRow]);

    const result = await service.upsert({ ...playerAward, playerId: 5 });

    expect(result).toEqual({ trophyAward: tiedRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
  });

  it('throws TrophyAwardUpsertConflictError when more than one row matches', async () => {
    await build(
      [{ recipientKind: 'team' }],
      [teamAwardRow, { ...teamAwardRow, id: 99 }],
    );

    await expect(service.upsert(teamAward)).rejects.toBeInstanceOf(
      TrophyAwardUpsertConflictError,
    );
  });

  it('throws when a player trophy is awarded with no playerId', async () => {
    const { db } = await build([{ recipientKind: 'player' }]);

    await expect(service.upsert(teamAward)).rejects.toBeInstanceOf(
      TrophyAwardRecipientMismatchError,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws when a team trophy is awarded with a playerId', async () => {
    const { db } = await build([{ recipientKind: 'team' }]);

    await expect(service.upsert(playerAward)).rejects.toBeInstanceOf(
      TrophyAwardRecipientMismatchError,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws when the referenced trophy does not exist', async () => {
    await build([]);

    await expect(service.upsert(teamAward)).rejects.toBeInstanceOf(
      TrophyAwardRecipientMismatchError,
    );
  });
});
