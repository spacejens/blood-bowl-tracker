import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  matches,
  matchExternalIds,
  matchTeams,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function makeFromBuilder(rows: unknown[]) {
  return {
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
}

function makeCountBuilder(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
}

describe('MatchesService', () => {
  let service: MatchesService;
  let externalIdRows: unknown[];
  let existingTeamRows: { teamEraId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingTeamRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === matchTeams ? existingTeamRows : externalIdRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakeMatch]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({ returning: () => Promise.resolve([fakeMatch]) }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [MatchesService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(MatchesService);
  });

  const baseData = {
    competitionId: 20,
    playedAt: new Date('2021-09-25'),
    name: 'Final',
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
    teamEraIds: [],
  };

  it('creates a new match when no external IDs match', async () => {
    const result = await service.upsert(baseData);

    expect(result).toEqual({
      match: { ...fakeMatch, teamEraIds: [] },
      created: true,
    });
    expect(insertCalls.some((c) => c.table === matches)).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts the match with its competitionId and playedAt', async () => {
    await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === matches);
    expect(call?.values).toEqual({
      competitionId: 20,
      playedAt: new Date('2021-09-25'),
      name: 'Final',
    });
  });

  it('updates the matching match when exactly one external ID matches', async () => {
    externalIdRows = [{ ownerId: 1, externalSystemId: 1, externalId: '89' }];

    const result = await service.upsert(baseData);

    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === matches)).toBe(true);
    expect(updateCalls[0]?.set).toEqual({
      competitionId: 20,
      playedAt: new Date('2021-09-25'),
      name: 'Final',
    });
  });

  it('throws MatchUpsertConflictError when external IDs match different matches', async () => {
    externalIdRows = [
      { ownerId: 1, externalSystemId: 1, externalId: '89' },
      { ownerId: 2, externalSystemId: 1, externalId: '90' },
    ];

    await expect(service.upsert(baseData)).rejects.toThrow(
      MatchUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts only the external-id pairs that are new', async () => {
    externalIdRows = [{ ownerId: 1, externalSystemId: 1, externalId: '89' }];

    await service.upsert({
      ...baseData,
      externalIds: [
        { externalSystemId: 1, externalId: '89' },
        { externalSystemId: 2, externalId: '90' },
      ],
    });

    const call = insertCalls.find((c) => c.table === matchExternalIds);
    expect(call?.values).toEqual([
      { matchId: 1, externalSystemId: 2, externalId: '90' },
    ]);
  });

  it('does not insert external-id rows when all pairs already exist', async () => {
    externalIdRows = [{ ownerId: 1, externalSystemId: 1, externalId: '89' }];

    await service.upsert(baseData);

    expect(insertCalls.some((c) => c.table === matchExternalIds)).toBe(false);
  });

  it('inserts only the match_teams rows that are new', async () => {
    existingTeamRows = [{ teamEraId: 100 }];

    const result = await service.upsert({
      ...baseData,
      teamEraIds: [100, 101],
    });

    const call = insertCalls.find((c) => c.table === matchTeams);
    expect(call?.values).toEqual([{ matchId: 1, teamEraId: 101 }]);
    expect(result.match.teamEraIds).toEqual([100, 101]);
  });

  it('does not insert match_teams rows when all links already exist', async () => {
    existingTeamRows = [{ teamEraId: 100 }, { teamEraId: 101 }];

    const result = await service.upsert({
      ...baseData,
      teamEraIds: [100, 101],
    });

    expect(insertCalls.some((c) => c.table === matchTeams)).toBe(false);
    expect(result.match.teamEraIds).toEqual([100, 101]);
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const svc = new MatchesService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(svc.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countMatchEvents', () => {
    it('countMatchEvents returns the match-events row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5200 }]);
      const svc = new MatchesService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(svc.countMatchEvents()).resolves.toBe(5200);
    });
  });

  describe('era-scoped counts', () => {
    it('countByEra returns the distinct match count for the era', async () => {
      const builder = makeCountBuilder([{ count: 30 }]);
      const select = vi.fn(() => builder);
      const service = new MatchesService({ select } as unknown as Db);
      await expect(service.countByEra(5)).resolves.toBe(30);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['team_eras.id', 'match_teams.team_era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
    });

    it('countMatchEventsByEra returns the match-event count for the era', async () => {
      const builder = makeCountBuilder([{ count: 210 }]);
      const select = vi.fn(() => builder);
      const service = new MatchesService({ select } as unknown as Db);
      await expect(service.countMatchEventsByEra(5)).resolves.toBe(210);
      // match_events -> match_teams -> team_eras
      expect(builder.innerJoin).toHaveBeenCalledTimes(2);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.match_id', 'match_events.match_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['team_eras.id', 'match_teams.team_era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
    });
  });

  describe('league-scoped counts', () => {
    it('countByLeague returns the distinct match count for the league', async () => {
      const builder = makeCountBuilder([{ count: 55 }]);
      const select = vi.fn(() => builder);
      const service = new MatchesService({ select } as unknown as Db);
      await expect(service.countByLeague(9)).resolves.toBe(55);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['team_eras.id', 'match_teams.team_era_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });

    it('countMatchEventsByLeague returns the match-event count for the league', async () => {
      const builder = makeCountBuilder([{ count: 400 }]);
      const select = vi.fn(() => builder);
      const service = new MatchesService({ select } as unknown as Db);
      await expect(service.countMatchEventsByLeague(9)).resolves.toBe(400);
      // match_events -> match_teams -> team_eras -> eras
      expect(builder.innerJoin).toHaveBeenCalledTimes(3);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.match_id', 'match_events.match_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['team_eras.id', 'match_teams.team_era_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 2, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });
  });

  describe('competition-scoped counts', () => {
    it('countByCompetition returns the match count for the competition', async () => {
      const builder = makeCountBuilder([{ count: 30 }]);
      const select = vi.fn(() => builder);
      const service = new MatchesService({ select } as unknown as Db);
      await expect(service.countByCompetition(7)).resolves.toBe(30);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });

    it('countMatchEventsByCompetition returns the match-event count for the competition', async () => {
      const builder = makeCountBuilder([{ count: 500 }]);
      const select = vi.fn(() => builder);
      const service = new MatchesService({ select } as unknown as Db);
      await expect(service.countMatchEventsByCompetition(7)).resolves.toBe(500);
      // match_events -> matches
      expect(builder.innerJoin).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['matches.id', 'match_events.match_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });
  });
});
