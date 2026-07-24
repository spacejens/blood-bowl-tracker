import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  matches,
  matchExternalIds,
  matchTeams,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { MatchesService, MatchUpsertConflictError } from './matches.service';

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
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [] as number[],
  };

  describe('upsert', () => {
    it('creates a new match when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: the one external ID is new and gets
      // inserted; query 3: no team-era links to sync (teamEraIds is empty).
      const { db, chains } = await build([], [fakeMatch]);

      const result = await service.upsert(baseData);

      expect(result).toEqual({
        match: { ...fakeMatch, teamEraIds: [] },
        created: true,
      });
      expect(chains).toHaveLength(4);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.insert).toHaveBeenCalledWith(matches);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts the match with its competitionId and playedAt', async () => {
      const { chains } = await build([], [fakeMatch]);

      await service.upsert(baseData);

      expect(firstCallArg(chains[1].values)).toEqual({
        competitionId: 20,
        playedAt: new Date('2021-09-25'),
        name: 'Final',
      });
    });

    it('updates the matching match when exactly one external ID matches', async () => {
      // query 0: external-id lookup finds one owner; query 1: the update
      // returns the row; the external ID already exists, so no join-table
      // insert; query 2: no team-era links to sync.
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '89' }],
        [fakeMatch],
      );

      const result = await service.upsert(baseData);

      expect(result.created).toBe(false);
      expect(chains).toHaveLength(3);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.update).toHaveBeenCalledWith(matches);
      expect(firstCallArg(chains[1].set)).toEqual({
        competitionId: 20,
        playedAt: new Date('2021-09-25'),
        name: 'Final',
      });
    });

    it('throws MatchUpsertConflictError when external IDs match different matches', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: '89' },
        { ownerId: 2, externalSystemId: 1, externalId: '90' },
      ]);

      await expect(service.upsert(baseData)).rejects.toThrow(
        MatchUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.insert).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts only the external-id pairs that are new', async () => {
      const { chains } = await build(
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

      expect(chains).toHaveLength(4);
      expect(firstCallArg(chains[2].values)).toEqual([
        { matchId: 1, externalSystemId: 2, externalId: '90' },
      ]);
    });

    it('does not insert external-id rows when all pairs already exist', async () => {
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '89' }],
        [fakeMatch],
      );

      await service.upsert(baseData);

      expect(chains).toHaveLength(3);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.insert).not.toHaveBeenCalledWith(matchExternalIds);
    });

    it('inserts only the match_teams rows that are new', async () => {
      const { chains } = await build([], [fakeMatch], [], [{ teamEraId: 100 }]);

      const result = await service.upsert({
        ...baseData,
        teamEraIds: [100, 101],
      });

      expect(chains).toHaveLength(5);
      expect(firstCallArg(chains[4].values)).toEqual([
        { matchId: 1, teamEraId: 101 },
      ]);
      expect(result.match.teamEraIds).toEqual([100, 101]);
    });

    it('does not insert match_teams rows when all links already exist', async () => {
      const { db, chains } = await build(
        [],
        [fakeMatch],
        [],
        [{ teamEraId: 100 }, { teamEraId: 101 }],
      );

      const result = await service.upsert({
        ...baseData,
        teamEraIds: [100, 101],
      });

      expect(chains).toHaveLength(4);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.insert).not.toHaveBeenCalledWith(matchTeams);
      expect(result.match.teamEraIds).toEqual([100, 101]);
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { chains } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(chains[0].from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countMatchEvents', () => {
    it('countMatchEvents returns the match-events row count', async () => {
      await build([{ count: 5200 }]);
      await expect(service.countMatchEvents()).resolves.toBe(5200);
    });
  });

  describe('era-scoped counts', () => {
    it('countByEra returns the distinct match count for the era', async () => {
      const { db, chains } = await build([{ count: 30 }]);
      await expect(service.countByEra(5)).resolves.toBe(30);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });

    it('countMatchEventsByEra returns the match-event count for the era', async () => {
      const { chains } = await build([{ count: 210 }]);
      await expect(service.countMatchEventsByEra(5)).resolves.toBe(210);
      // match_events -> match_teams -> team_eras
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'match_events.match_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('league-scoped counts', () => {
    it('countByLeague returns the distinct match count for the league', async () => {
      const { db, chains } = await build([{ count: 55 }]);
      await expect(service.countByLeague(9)).resolves.toBe(55);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });

    it('countMatchEventsByLeague returns the match-event count for the league', async () => {
      const { chains } = await build([{ count: 400 }]);
      await expect(service.countMatchEventsByLeague(9)).resolves.toBe(400);
      // match_events -> match_teams -> team_eras -> eras
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'match_events.match_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('competition-scoped counts', () => {
    it('countByCompetition returns the match count for the competition', async () => {
      const { db, chains } = await build([{ count: 30 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(30);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('countMatchEventsByCompetition returns the match-event count for the competition', async () => {
      const { chains } = await build([{ count: 500 }]);
      await expect(service.countMatchEventsByCompetition(7)).resolves.toBe(500);
      // match_events -> matches
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['matches.id', 'match_events.match_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });
});
