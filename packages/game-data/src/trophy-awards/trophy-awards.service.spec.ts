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
   * `rowsPerQuery[1]` the conflict-tolerant insert, and `rowsPerQuery[2]` the
   * natural-key lookup that only runs when that insert hits the unique
   * constraint and returns nothing.
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
      [teamAwardRow],
    );

    const result = await service.upsert(teamAward);

    expect(result).toEqual({ trophyAward: teamAwardRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
    // Two queries only: the insert succeeded, so no fallback lookup ran.
    expect(chains).toHaveLength(2);
  });

  it('inserts a player award when no matching row exists', async () => {
    const { db } = await build([{ recipientKind: 'player' }], [playerAwardRow]);

    const result = await service.upsert(playerAward);

    expect(result).toEqual({ trophyAward: playerAwardRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
  });

  it('targets the natural-key constraint columns when inserting', async () => {
    const { chains } = await build([{ recipientKind: 'team' }], [teamAwardRow]);

    await service.upsert(teamAward);

    expect(chains[1].onConflictDoNothing).toHaveBeenCalledWith({
      target: [
        trophyAwards.trophyId,
        trophyAwards.competitionId,
        trophyAwards.teamEraId,
        trophyAwards.playerId,
      ],
    });
  });

  it('returns the existing row when the insert hits the unique constraint', async () => {
    const { db, chains } = await build(
      [{ recipientKind: 'team' }],
      [],
      [teamAwardRow],
    );

    const result = await service.upsert(teamAward);

    expect(result).toEqual({ trophyAward: teamAwardRow, created: false });
    // The insert is still attempted — that is the point of insert-first — but
    // returns nothing, so the natural-key lookup supplies the existing row.
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
    expect(chains).toHaveLength(3);
  });

  it('records a tie as a second row for the same trophy and competition', async () => {
    // A tie is a different playerId, so the insert does not conflict and a
    // second row is created for the same trophy + competition.
    const tiedRow = { ...playerAwardRow, id: 12, playerId: 5 };
    const { db } = await build([{ recipientKind: 'player' }], [tiedRow]);

    const result = await service.upsert({ ...playerAward, playerId: 5 });

    expect(result).toEqual({ trophyAward: tiedRow, created: true });
    expect(db.insert).toHaveBeenCalledWith(trophyAwards);
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
      playerPositionId: null,
      playerPositionName: null,
      playerIsStarPlayer: null,
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
      playerPositionId: 60,
      playerPositionName: 'Blitzer',
      playerIsStarPlayer: false,
    };
    const starRecipient = {
      ...playerRecipient,
      playerId: 41,
      playerName: 'Morg N Thorg',
      playerPositionId: 61,
      playerPositionName: 'Morg N Thorg',
      playerIsStarPlayer: true,
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

    it('carries the position and star flag of a star hire that received the trophy', async () => {
      await build([starRecipient]);

      await expect(service.listRecipients(1, 30)).resolves.toEqual([
        starRecipient,
      ]);
    });

    it('still returns a team-only recipient, whose position fields are all null', async () => {
      await build([teamRecipient]);

      await expect(service.listRecipients(1, 30)).resolves.toEqual([
        teamRecipient,
      ]);
    });

    it('orders by era start date, then era id as a tiebreaker, then competition start date, all descending (most recent first, era rows kept adjacent even on a tied era start date)', async () => {
      const { chains } = await build([teamRecipient, playerRecipient]);

      await service.listRecipients(1, 30);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['eras.start_date'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 0))).toContain(' desc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['eras.id'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 1))).toContain(' desc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 2))).toEqual(
        ['competitions.start_date'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 2))).toContain(' desc');
    });

    it('joins through competitions, eras, team eras and teams, and left-joins players and positions', async () => {
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
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 1, 1)),
      ).toEqual(['positions.id', 'players.position_id']);
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

  describe('listForCompetition', () => {
    const teamAwardRecipient = {
      trophyId: 1,
      trophyName: 'Season Gold',
      recipientKind: 'team' as const,
      teamId: 30,
      teamName: 'Reikland Reavers',
      playerId: null,
      playerName: null,
      playerPositionId: null,
      playerPositionName: null,
      playerIsStarPlayer: null,
    };
    const playerAwardRecipient = {
      trophyId: 2,
      trophyName: 'Most Valuable Player',
      recipientKind: 'player' as const,
      teamId: 31,
      teamName: 'Gouged Eye',
      playerId: 40,
      playerName: 'Griff Oberwald',
      playerPositionId: 60,
      playerPositionName: 'Blitzer',
      playerIsStarPlayer: false,
    };
    const starAwardRecipient = {
      ...playerAwardRecipient,
      trophyId: 3,
      playerId: 41,
      playerName: 'Morg N Thorg',
      playerPositionId: 61,
      playerPositionName: 'Morg N Thorg',
      playerIsStarPlayer: true,
    };

    it('returns the team awards recorded for the requested competition', async () => {
      const { chains } = await build([teamAwardRecipient]);

      await expect(service.listForCompetition(7)).resolves.toEqual([
        teamAwardRecipient,
      ]);

      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('returns the player id and name for a player award', async () => {
      await build([playerAwardRecipient]);

      await expect(service.listForCompetition(7)).resolves.toEqual([
        playerAwardRecipient,
      ]);
    });

    it('returns team and player awards together for a mixed competition', async () => {
      await build([teamAwardRecipient, playerAwardRecipient]);

      await expect(service.listForCompetition(7)).resolves.toEqual([
        teamAwardRecipient,
        playerAwardRecipient,
      ]);
    });

    it('carries the position and star flag of a star hire that received the award', async () => {
      await build([starAwardRecipient]);

      await expect(service.listForCompetition(7)).resolves.toEqual([
        starAwardRecipient,
      ]);
    });

    it('still returns a team-only award, whose position fields are all null', async () => {
      await build([teamAwardRecipient]);

      await expect(service.listForCompetition(7)).resolves.toEqual([
        teamAwardRecipient,
      ]);
    });

    it('returns one row per recipient when a trophy was tied between several players', async () => {
      const tied = {
        ...playerAwardRecipient,
        teamId: 32,
        teamName: 'Skavenblight Scramblers',
        playerId: 41,
        playerName: 'Hakflem Skuttlespike',
      };
      await build([playerAwardRecipient, tied]);

      await expect(service.listForCompetition(7)).resolves.toEqual([
        playerAwardRecipient,
        tied,
      ]);
    });

    it('orders by recipient kind (team before player, per the enum declaration order) then trophy name, then trophy id, team name/id and player name/id as tiebreakers, all ascending', async () => {
      const { chains } = await build([teamAwardRecipient]);

      await service.listForCompetition(7);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['trophies.recipient_kind'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 0))).toContain(' asc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['trophies.name'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 1))).toContain(' asc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 2))).toEqual(
        ['trophies.id'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 2))).toContain(' asc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 3))).toEqual(
        ['teams.name'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 3))).toContain(' asc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 4))).toEqual(
        ['teams.id'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 4))).toContain(' asc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 5))).toEqual(
        ['players.name'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 5))).toContain(' asc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 6))).toEqual(
        ['players.id'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 6))).toContain(' asc');
    });

    it('joins through trophies, team eras and teams, and left-joins players and positions', async () => {
      const { chains } = await build([]);

      await service.listForCompetition(7);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['trophies.id', 'trophy_awards.trophy_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['team_eras.id', 'trophy_awards.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['players.id', 'trophy_awards.player_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 1, 1)),
      ).toEqual(['positions.id', 'players.position_id']);
    });

    it('does not cap the result, since a single competition awards a bounded number of trophies', async () => {
      const { chains } = await build([teamAwardRecipient]);

      await service.listForCompetition(7);

      expect(chains[0].limit).not.toHaveBeenCalled();
    });

    it('returns an empty list when the competition awarded nothing', async () => {
      await build([]);

      await expect(service.listForCompetition(7)).resolves.toEqual([]);
    });
  });

  describe('listByTeam', () => {
    const teamHonor = {
      trophyId: 1,
      trophyName: 'Spike! Cup',
      competitionName: 'Major Season 24',
      competitionStartDate: '2024-01-15',
      eraId: 20,
      eraName: 'Season 4',
      playerId: null,
      playerName: null,
      playerPositionId: null,
      playerPositionName: null,
      playerIsStarPlayer: null,
    };
    const playerHonor = {
      trophyId: 2,
      trophyName: 'MVP',
      competitionName: 'Minor Season 23',
      competitionStartDate: '2023-01-15',
      eraId: 19,
      eraName: 'Season 2',
      playerId: 40,
      playerName: 'Grombrindal',
      playerPositionId: 60,
      playerPositionName: 'Blitzer',
      playerIsStarPlayer: false,
    };
    const starHonor = {
      ...playerHonor,
      trophyId: 3,
      playerId: 41,
      playerName: 'Morg N Thorg',
      playerPositionId: 61,
      playerPositionName: 'Morg N Thorg',
      playerIsStarPlayer: true,
    };

    it('returns the team-kind honors of the requested team, capped at the limit', async () => {
      const { chains } = await build([teamHonor]);

      await expect(service.listByTeam(30, 30)).resolves.toEqual([teamHonor]);

      expect(chains[0].limit).toHaveBeenCalledWith(30);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(30);
    });

    it('returns player-kind honors, carrying the player id and name', async () => {
      await build([playerHonor]);

      await expect(service.listByTeam(30, 30)).resolves.toEqual([playerHonor]);
    });

    it('carries the position and star flag of a star hire that won a trophy', async () => {
      await build([starHonor]);

      await expect(service.listByTeam(30, 30)).resolves.toEqual([starHonor]);
    });

    it('still returns a team-only honor, whose position fields are all null', async () => {
      await build([teamHonor]);

      await expect(service.listByTeam(30, 30)).resolves.toEqual([teamHonor]);
    });

    it('returns team-kind and player-kind honors interleaved in one list', async () => {
      await build([teamHonor, playerHonor]);

      await expect(service.listByTeam(30, 30)).resolves.toEqual([
        teamHonor,
        playerHonor,
      ]);
    });

    it('filters on the team behind the award, not on the award itself', async () => {
      const { chains } = await build([]);

      await service.listByTeam(30, 30);

      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'team_eras.team_id',
      ]);
    });

    it('joins through team eras, trophies, competitions and eras, and left-joins players', async () => {
      const { chains } = await build([]);

      await service.listByTeam(30, 30);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'trophy_awards.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['trophies.id', 'trophy_awards.trophy_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['competitions.id', 'trophy_awards.competition_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['eras.id', 'competitions.era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['players.id', 'trophy_awards.player_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 1, 1)),
      ).toEqual(['positions.id', 'players.position_id']);
    });

    it('orders by era start date, then era id as a tiebreaker, then competition start date, all descending', async () => {
      const { chains } = await build([teamHonor, playerHonor]);

      await service.listByTeam(30, 30);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['eras.start_date'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 0))).toContain(' desc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['eras.id'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 1))).toContain(' desc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 2))).toEqual(
        ['competitions.start_date'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 2))).toContain(' desc');
    });

    it('passes the caller-supplied limit through unchanged', async () => {
      const { chains } = await build([]);

      await service.listByTeam(30, 5);

      expect(chains[0].limit).toHaveBeenCalledWith(5);
    });

    it('returns an empty list when the team has won nothing', async () => {
      await build([]);

      await expect(service.listByTeam(30, 30)).resolves.toEqual([]);
    });
  });

  describe('countByTeam', () => {
    it('returns the total number of honors the team has', async () => {
      const { db, chains } = await build([{ count: 7 }]);

      await expect(service.countByTeam(30)).resolves.toBe(7);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(30);
    });

    it('counts through team eras, so player awards of the team count too', async () => {
      const { chains } = await build([{ count: 7 }]);

      await service.countByTeam(30);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'trophy_awards.team_era_id']);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'team_eras.team_id',
      ]);
    });

    it('returns zero when the team has won nothing', async () => {
      await build([{ count: 0 }]);

      await expect(service.countByTeam(30)).resolves.toBe(0);
    });
  });

  describe('listByPlayer', () => {
    const mvp = {
      trophyId: 2,
      trophyName: 'MVP',
      competitionId: 50,
      competitionName: 'Major Season 24',
      competitionStartDate: '2024-01-15',
    };
    const mostViolent = {
      trophyId: 3,
      trophyName: 'Most Violent Player',
      competitionId: 49,
      competitionName: 'Minor Season 23',
      competitionStartDate: '2023-01-15',
    };

    it('returns the honors of the requested player, capped at the limit', async () => {
      const { chains } = await build([mvp, mostViolent]);

      await expect(service.listByPlayer(40, 30)).resolves.toEqual([
        mvp,
        mostViolent,
      ]);

      expect(chains[0].limit).toHaveBeenCalledWith(30);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(40);
    });

    it('filters on the award row own player, with no join through team eras', async () => {
      const { chains } = await build([]);

      await service.listByPlayer(40, 30);

      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'trophy_awards.player_id',
      ]);
      expect(chains[0].leftJoin).not.toHaveBeenCalled();
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
    });

    it('joins trophies and competitions only', async () => {
      const { chains } = await build([]);

      await service.listByPlayer(40, 30);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['trophies.id', 'trophy_awards.trophy_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['competitions.id', 'trophy_awards.competition_id']);
    });

    it('orders by competition start date, then competition id and trophy id as tiebreakers, all descending', async () => {
      const { chains } = await build([mvp, mostViolent]);

      await service.listByPlayer(40, 30);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['competitions.start_date'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 0))).toContain(' desc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['competitions.id'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 1))).toContain(' desc');
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 2))).toEqual(
        ['trophies.id'],
      );
      expect(sqlText(firstCallArg(chains[0].orderBy, 0, 2))).toContain(' desc');
    });

    it('passes the caller-supplied limit through unchanged', async () => {
      const { chains } = await build([]);

      await service.listByPlayer(40, 5);

      expect(chains[0].limit).toHaveBeenCalledWith(5);
    });

    it('returns an empty list when the player has won nothing', async () => {
      await build([]);

      await expect(service.listByPlayer(40, 30)).resolves.toEqual([]);
    });
  });

  describe('countByPlayer', () => {
    it('returns the total number of honors the player has', async () => {
      const { db, chains } = await build([{ count: 4 }]);

      await expect(service.countByPlayer(40)).resolves.toBe(4);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(40);
    });

    it('counts award rows directly, without joining team eras', async () => {
      const { chains } = await build([{ count: 4 }]);

      await service.countByPlayer(40);

      expect(chains[0].innerJoin).not.toHaveBeenCalled();
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'trophy_awards.player_id',
      ]);
    });

    it('returns zero when the player has won nothing', async () => {
      await build([{ count: 0 }]);

      await expect(service.countByPlayer(40)).resolves.toBe(0);
    });
  });
});
