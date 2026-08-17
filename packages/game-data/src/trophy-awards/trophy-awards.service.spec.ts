import type { Db } from '@blood-bowl-tracker/db';
import { DB, trophyAwards } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
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

  describe('listRecipients', () => {
    const teamRecipient = {
      competitionName: 'Major Season 24',
      competitionStartDate: '2024-01-15',
      eraId: 20,
      eraName: 'BB2020',
      teamId: 30,
      teamName: 'Reikland Reavers',
      playerId: null,
      playerName: null,
    };
    const playerRecipient = {
      competitionName: 'Minor Season 23',
      competitionStartDate: '2023-01-15',
      eraId: 19,
      eraName: 'BB2016',
      teamId: 31,
      teamName: 'Gouged Eye',
      playerId: 40,
      playerName: 'Griff Oberwald',
    };

    it('returns team recipients for the requested trophy, capped at the limit', async () => {
      const { chains } = await build([teamRecipient]);

      await expect(service.listRecipients(1, 30)).resolves.toEqual([
        teamRecipient,
      ]);

      expect(chains[0].limit).toHaveBeenCalledWith(30);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(1);
    });

    it('returns the player id and name for a player trophy', async () => {
      await build([playerRecipient]);

      await expect(service.listRecipients(1, 30)).resolves.toEqual([
        playerRecipient,
      ]);
    });

    it('orders by era start date before competition start date, both descending (most recent first, era rows kept adjacent)', async () => {
      const { chains } = await build([teamRecipient, playerRecipient]);

      await service.listRecipients(1, 30);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['eras.start_date'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 0))).toContain(' desc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['competitions.start_date'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 1))).toContain(' desc');
    });

    it('joins through competitions, eras, team eras and teams, and left-joins players', async () => {
      const { chains } = await build([]);

      await service.listRecipients(1, 30);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['competitions.id', 'trophy_awards.competition_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'competitions.era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['team_eras.id', 'trophy_awards.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['players.id', 'trophy_awards.player_id']);
    });

    it('returns the era each award was won in', async () => {
      await build([teamRecipient]);

      const [recipient] = await service.listRecipients(1, 30);

      expect(recipient.eraId).toBe(20);
      expect(recipient.eraName).toBe('BB2020');
    });

    it('returns an empty list when the trophy has never been awarded', async () => {
      await build([]);

      await expect(service.listRecipients(1, 30)).resolves.toEqual([]);
    });
  });

  describe('countRecipients', () => {
    it('returns the total number of awards of the trophy', async () => {
      const { db, chains } = await build([{ count: 42 }]);

      await expect(service.countRecipients(1)).resolves.toBe(42);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(1);
    });

    it('returns zero when the trophy has never been awarded', async () => {
      await build([{ count: 0 }]);

      await expect(service.countRecipients(1)).resolves.toBe(0);
    });
  });
});
