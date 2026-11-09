import type { Db } from '@blood-bowl-tracker/db';
import { DB, trophyAwards } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  DrizzleQueryError,
  extractAllFilterValues,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { UnspentSppDecisionService } from '../spp/unspent-spp-decision.service';
import {
  TrophyAwardCompetitionGroupMismatchError,
  TrophyAwardRecipientMismatchError,
  TrophyAwardsService,
} from './trophy-awards.service';
import { uniqueViolation } from './trophy-awards.test-helpers';

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

/** A generic award used by the league-scoped assertion cases below. */
const baseAward = {
  trophyId: 1,
  competitionId: 2,
  teamEraId: 3,
  playerId: null,
};
const fakeAward = { ...playerAwardRow, id: 13, playerId: 11 };

/** The trophy-lookup row: recipient kind plus the trophy's curated group. */
const teamTrophyRow = [
  { recipientKind: 'team', competitionGroupId: 1, leagueId: null },
];
const playerTrophyRow = [
  { recipientKind: 'player', competitionGroupId: 1, leagueId: null },
];
/** The competition-lookup row, in the same group as both trophy rows. */
const matchingCompetitionRow = [{ competitionGroupId: 1 }];
/**
 * The player-existence lookup's row, carrying the team era every player award
 * here already states. Only a player award issues this query; a team award has
 * no player to check.
 */
const existingPlayerRow = [{ teamEraId: 3 }];

describe('TrophyAwardsService', () => {
  let service: TrophyAwardsService;

  /**
   * `rowsPerQuery[0]` is always the trophy lookup (its `recipientKind` and
   * `competitionGroupId`) and `rowsPerQuery[1]` the competition lookup (its
   * `competitionGroupId`). A player award then spends one more slot on the
   * player-existence lookup, which a team award skips. Last come the insert
   * and the natural-key lookup that only runs when that insert throws a
   * `trophy_awards` unique violation. A slot may be an `Error` instead of a
   * row array, which makes that one query reject - the only way to reach the
   * conflict path, since the insert carries no `ON CONFLICT` clause.
   */
  async function build(...rowsPerQuery: (unknown[] | Error)[]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophyAwardsService,
        { provide: DB, useValue: db },
        {
          provide: UnspentSppDecisionService,
          useValue: mock<UnspentSppDecisionService>(),
        },
        {
          provide: PlayerSkillsService,
          useValue: mock<PlayerSkillsService>(),
        },
      ],
    }).compile();
    service = moduleRef.get(TrophyAwardsService);
    return { db, chains };
  }

  it('inserts a team award when no matching row exists', async () => {
    const { db, chains } = await build(teamTrophyRow, matchingCompetitionRow, [
      teamAwardRow,
    ]);

    const result = await service.upsert(teamAward);

    expect(result).toEqual({ trophyAward: teamAwardRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
    // Three queries only: the insert succeeded, so no fallback lookup ran.
    expect(chains).toHaveLength(3);
  });

  it('inserts a player award when no matching row exists', async () => {
    const { db } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      existingPlayerRow,
      [playerAwardRow],
    );

    const result = await service.upsert(playerAward);

    expect(result).toEqual({ trophyAward: playerAwardRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
  });

  it('inserts without an ON CONFLICT clause, so a discarded row cannot trip the history foreign key', async () => {
    const { chains } = await build(teamTrophyRow, matchingCompetitionRow, [
      teamAwardRow,
    ]);

    await service.upsert(teamAward);

    // `trophy_awards` is history-tracked: its BEFORE INSERT trigger writes a
    // history row for every *attempted* row, so a row ON CONFLICT DO NOTHING
    // discards leaves a history row whose deferred FK has nothing to point at.
    // A plain insert that fails on the unique constraint rolls the whole
    // statement back instead, trigger writes included.
    expect(chains[2].onConflictDoNothing).not.toHaveBeenCalled();
  });

  it('inserts all four natural-key ids, including a null playerId', async () => {
    const { chains } = await build(teamTrophyRow, matchingCompetitionRow, [
      teamAwardRow,
    ]);

    await service.upsert(teamAward);

    expect(chains[2].values).toHaveBeenCalledWith({
      trophyId: 1,
      competitionId: 2,
      teamEraId: 3,
      playerId: null,
    });
  });

  it('returns the existing row when the insert hits the unique constraint', async () => {
    const { db, chains } = await build(
      teamTrophyRow,
      matchingCompetitionRow,
      uniqueViolation(),
      [teamAwardRow],
    );

    const result = await service.upsert(teamAward);

    expect(result).toEqual({ trophyAward: teamAwardRow, created: false });
    // The insert is still attempted - that is the point of insert-first - but
    // raises the unique violation, so the natural-key lookup supplies the
    // existing row.
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
    expect(chains).toHaveLength(4);
    // The fallback lookup must filter on IS NULL for a team award, not a
    // literal playerId equality - otherwise it would never match.
    expect(sqlText(firstCallArg(chains[3].where))).toContain('is null');
  });

  it('returns the existing row when a player award hits the unique constraint', async () => {
    const { chains } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      existingPlayerRow,
      uniqueViolation(),
      [playerAwardRow],
    );

    const result = await service.upsert(playerAward);

    expect(result).toEqual({ trophyAward: playerAwardRow, created: false });
    // The fallback lookup must filter on the player id itself, not IS NULL -
    // otherwise a re-imported player award could return the wrong row.
    expect(extractAllFilterValues(firstCallArg(chains[4].where))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('propagates an insert failure that is not a unique violation', async () => {
    const notNull = Object.assign(
      new Error('null value in column violates not-null constraint'),
      { code: '23502', table_name: 'trophy_awards', constraint_name: null },
    );
    const error = new DrizzleQueryError(
      'insert into "trophy_awards" ...',
      [],
      notNull,
    );
    const { chains } = await build(
      teamTrophyRow,
      matchingCompetitionRow,
      error,
    );

    await expect(service.upsert(teamAward)).rejects.toBe(error);
    // No fallback lookup ran: the error was rethrown, not swallowed into the
    // "already recorded" path.
    expect(chains).toHaveLength(3);
  });

  it('propagates a unique violation raised by a different table', async () => {
    const error = uniqueViolation(
      'trophy_awards_history',
      'trophy_awards_history_pkey',
    );
    const { chains } = await build(
      teamTrophyRow,
      matchingCompetitionRow,
      error,
    );

    await expect(service.upsert(teamAward)).rejects.toBe(error);
    expect(chains).toHaveLength(3);
  });

  it("propagates a unique violation on trophy_awards' own primary key", async () => {
    // A 23505 on the primary key is a desynced sequence, not this award
    // already existing, so it must not be reinterpreted as "already recorded".
    const error = uniqueViolation('trophy_awards', 'trophy_awards_pkey');
    const { chains } = await build(
      teamTrophyRow,
      matchingCompetitionRow,
      error,
    );

    await expect(service.upsert(teamAward)).rejects.toBe(error);
    expect(chains).toHaveLength(3);
  });

  it('throws when the insert reports success but returns no row', async () => {
    const { db, chains } = await build(teamTrophyRow, matchingCompetitionRow, [
      // An empty array from `.returning()` on a successful insert is not a
      // real Postgres behavior, but guards against it defensively - see the
      // check right after the insert.
    ]);

    await expect(service.upsert(teamAward)).rejects.toThrow(
      /reported success but returned no row/,
    );
    // No fallback lookup ran: an empty `.returning()` is not the unique-
    // violation conflict path, so it must not be reinterpreted as one.
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
    expect(chains).toHaveLength(3);
  });

  it('throws when the insert conflicts but no matching row can be read back', async () => {
    const { db } = await build(
      teamTrophyRow,
      matchingCompetitionRow,
      uniqueViolation(),
      [],
    );

    await expect(service.upsert(teamAward)).rejects.toThrow(
      /no matching row could be read back/,
    );
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
  });

  it('records a tie as a second row for the same trophy and competition', async () => {
    // A tie is a different playerId, so the insert does not conflict and a
    // second row is created for the same trophy + competition.
    const tiedRow = { ...playerAwardRow, id: 12, playerId: 5 };
    const { db } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      existingPlayerRow,
      [tiedRow],
    );

    const result = await service.upsert({ ...playerAward, playerId: 5 });

    expect(result).toEqual({ trophyAward: tiedRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
  });

  it('throws when a player trophy is awarded with no playerId', async () => {
    const { db } = await build(playerTrophyRow);

    await expect(service.upsert(teamAward)).rejects.toBeInstanceOf(
      TrophyAwardRecipientMismatchError,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws when a team trophy is awarded with a playerId', async () => {
    const { db } = await build(teamTrophyRow);

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

  it('inserts when the competition is in the trophy own group', async () => {
    const { db, chains } = await build(
      [{ recipientKind: 'player', competitionGroupId: 3, leagueId: null }],
      [{ competitionGroupId: 3 }],
      existingPlayerRow,
      [playerAwardRow],
    );

    const result = await service.upsert(playerAward);

    expect(result).toEqual({ trophyAward: playerAwardRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
    // Four queries only: the insert succeeded, so no fallback lookup ran.
    expect(chains).toHaveLength(4);
  });

  it('throws when the competition belongs to a different competition group', async () => {
    const { db } = await build(
      [{ recipientKind: 'player', competitionGroupId: 1, leagueId: null }],
      [{ competitionGroupId: 2 }],
    );

    await expect(service.upsert(playerAward)).rejects.toBeInstanceOf(
      TrophyAwardCompetitionGroupMismatchError,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws when the referenced competition does not exist', async () => {
    const { db } = await build(playerTrophyRow, []);

    await expect(service.upsert(playerAward)).rejects.toBeInstanceOf(
      TrophyAwardCompetitionGroupMismatchError,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts an award when a league-scoped trophy matches the competition group's league", async () => {
    // query 0: the trophy row (league-scoped);
    // query 1: the competition joined to its group, yielding the league;
    // query 2: the player-existence lookup; query 3: the insert.
    const { chains } = await build(
      [{ recipientKind: 'player', competitionGroupId: null, leagueId: 7 }],
      [{ leagueId: 7 }],
      existingPlayerRow,
      [fakeAward],
    );

    const result = await service.upsert({ ...baseAward, playerId: 11 });

    expect(result).toEqual({ trophyAward: fakeAward, created: true });
    expect(chains[3].values).toHaveBeenCalled();
  });

  it('rejects an award when a league-scoped trophy belongs to another league', async () => {
    const { chains } = await build(
      [{ recipientKind: 'player', competitionGroupId: null, leagueId: 7 }],
      [{ leagueId: 9 }],
    );

    await expect(
      service.upsert({ ...baseAward, playerId: 11 }),
    ).rejects.toBeInstanceOf(TrophyAwardCompetitionGroupMismatchError);
    expect(chains).toHaveLength(2);
  });

  it('rejects an award for a league-scoped trophy when the competition does not exist', async () => {
    await build(
      [{ recipientKind: 'player', competitionGroupId: null, leagueId: 7 }],
      [],
    );

    await expect(
      service.upsert({ ...baseAward, playerId: 11 }),
    ).rejects.toBeInstanceOf(TrophyAwardCompetitionGroupMismatchError);
  });
});
