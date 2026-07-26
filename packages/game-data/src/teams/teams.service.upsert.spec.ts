import type { Db } from '@blood-bowl-tracker/db';
import { DB, teamEras, teams } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TeamsService, TeamUpsertConflictError } from './teams.service';
import { fakeTeam } from './teams.service.test-helpers';

describe('TeamsService', () => {
  let service: TeamsService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TeamsService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  const baseData = {
    name: '40 grinders',
    raceId: 5,
    coachId: 9,
    eras: [20],
    externalIds: [
      { externalSystemId: 1, externalId: '40g' },
      { externalSystemId: 2, externalId: '40 grinders' },
    ],
  };

  it('creates a new team with its eras when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert returns
    // the row; query 2: both external IDs are new, so they get inserted;
    // query 3: no existing team_eras rows; query 4: the one era link is new
    // and gets inserted.
    const { db, chains } = await build(
      [],
      [fakeTeam],
      [],
      [],
      [{ id: 100, eraId: 20 }],
    );

    const result = await service.upsert(baseData);

    expect(result).toEqual({
      team: { ...fakeTeam, eras: [{ id: 100, eraId: 20 }] },
      created: true,
    });
    expect(chains).toHaveLength(5);
    expect(db.insert).toHaveBeenCalledWith(teams);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('inserts the team with its name, raceId and coachId', async () => {
    const { chains } = await build(
      [],
      [fakeTeam],
      [],
      [],
      [{ id: 100, eraId: 20 }],
    );

    await service.upsert(baseData);

    expect(firstCallArg(chains[1].values)).toEqual({
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
    });
  });

  it('updates the matching team when exactly one external ID matches', async () => {
    // query 0: external-id lookup finds one owner; query 1: the update
    // returns the row; query 2: the one still-missing external ID gets
    // inserted; query 3: no existing team_eras rows; query 4: the one era
    // link is new and gets inserted.
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '40g' }],
      [fakeTeam],
      [],
      [],
      [{ id: 100, eraId: 20 }],
    );

    const result = await service.upsert(baseData);

    expect(result.created).toBe(false);
    expect(chains).toHaveLength(5);
    expect(db.update).toHaveBeenCalledWith(teams);
  });

  it('throws TeamUpsertConflictError when external IDs match different teams', async () => {
    const { db, chains } = await build([
      { ownerId: 1, externalSystemId: 1, externalId: '40g' },
      { ownerId: 2, externalSystemId: 2, externalId: '40 grinders' },
    ]);

    await expect(service.upsert(baseData)).rejects.toThrow(
      TeamUpsertConflictError,
    );
    expect(chains).toHaveLength(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('inserts only the external IDs that are new for an existing team', async () => {
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '40g' }],
      [fakeTeam],
      [],
      [],
      [{ id: 100, eraId: 20 }],
    );

    await service.upsert(baseData);

    expect(firstCallArg(chains[2].values)).toEqual([
      { teamId: 1, externalSystemId: 2, externalId: '40 grinders' },
    ]);
  });

  it('inserts a team_eras row for an era not linked yet and returns the full set', async () => {
    // No external IDs match (created=true, both are new -> query 2 insert
    // runs), no existing team_eras rows (query 3), so the one era link is new
    // and gets inserted (query 4).
    const { chains } = await build(
      [],
      [fakeTeam],
      [],
      [],
      [{ id: 100, eraId: 20 }],
    );

    const result = await service.upsert(baseData);

    expect(chains).toHaveLength(5);
    expect(firstCallArg(chains[4].values)).toEqual([{ teamId: 1, eraId: 20 }]);
    expect(result.team.eras).toEqual([{ id: 100, eraId: 20 }]);
  });

  it('does not insert a team_eras row for an era already linked', async () => {
    // query 3 (existing team_eras) returns the era already linked, so
    // toInsert is empty and query 4 (the team_eras insert) never runs.
    const { db, chains } = await build([], [fakeTeam], [], [{ eraId: 20 }]);

    const result = await service.upsert(baseData);

    expect(chains).toHaveLength(4);
    expect(db.insert).not.toHaveBeenCalledWith(teamEras);
    expect(result.team.eras).toEqual([{ eraId: 20 }]);
  });

  it('treats an omitted eras array as no era changes', async () => {
    // Only one external ID this time, so query 2 (join-table insert) still
    // runs (it's new); query 3 (existing team_eras) returns the era already
    // linked, and eras: [] means toInsert is empty regardless, so query 4
    // (the team_eras insert) never runs.
    const { db, chains } = await build([], [fakeTeam], [], [{ eraId: 20 }]);

    const result = await service.upsert({
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: '40g' }],
    });

    expect(chains).toHaveLength(4);
    expect(db.insert).not.toHaveBeenCalledWith(teamEras);
    expect(result.team.eras).toEqual([{ eraId: 20 }]);
  });

  it('updates only the supplied column, leaving raceId and coachId alone', async () => {
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '40g' }],
      [fakeTeam],
      [],
    );

    await service.upsert({
      name: '40 Grinders II',
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: '40g' }],
    });

    expect(firstCallArg(chains[1].set)).toEqual({ name: '40 Grinders II' });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { db } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    it('returns the distinct team count for the era', async () => {
      const { db, chains } = await build([{ count: 12 }]);
      await expect(service.countByEra(5)).resolves.toBe(12);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('returns the distinct team count for the league', async () => {
      const { db, chains } = await build([{ count: 20 }]);
      await expect(service.countByLeague(9)).resolves.toBe(20);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('returns the distinct team count for the competition', async () => {
      const { db, chains } = await build([{ count: 9 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(9);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'competition_teams.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });
});
