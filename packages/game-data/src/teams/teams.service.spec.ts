import type { Db } from '@blood-bowl-tracker/db';
import { DB, teamEras, teamExternalIds, teams } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamsService, TeamUpsertConflictError } from './teams.service';

const fakeTeam = {
  id: 1,
  name: '40 grinders',
  raceId: 5,
  coachId: 9,
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

describe('TeamsService', () => {
  let service: TeamsService;
  let externalIdRows: unknown[];
  let existingEraRows: { eraId: number }[];
  let insertedEraRows: { id: number; eraId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingEraRows = [];
    insertedEraRows = [{ id: 100, eraId: 20 }];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === teamExternalIds ? externalIdRows : existingEraRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return {
            returning: (columns?: unknown) =>
              Promise.resolve(
                table === teamEras && columns ? insertedEraRows : [fakeTeam],
              ),
          };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({ returning: () => Promise.resolve([fakeTeam]) }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [TeamsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(TeamsService);
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
    const result = await service.upsert(baseData);

    expect(result).toEqual({
      team: { ...fakeTeam, eras: [{ id: 100, eraId: 20 }] },
      created: true,
    });
    expect(insertCalls.some((c) => c.table === teams)).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts the team with its name, raceId and coachId', async () => {
    await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === teams);
    expect(call?.values).toEqual({
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
    });
  });

  it('updates the matching team when exactly one external ID matches', async () => {
    externalIdRows = [{ teamId: 1, externalSystemId: 1, externalId: '40g' }];

    const result = await service.upsert(baseData);

    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === teams)).toBe(true);
  });

  it('throws TeamUpsertConflictError when external IDs match different teams', async () => {
    externalIdRows = [
      { teamId: 1, externalSystemId: 1, externalId: '40g' },
      { teamId: 2, externalSystemId: 2, externalId: '40 grinders' },
    ];

    await expect(service.upsert(baseData)).rejects.toThrow(
      TeamUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts only the external IDs that are new for an existing team', async () => {
    externalIdRows = [{ teamId: 1, externalSystemId: 1, externalId: '40g' }];

    await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === teamExternalIds);
    expect(call?.values).toEqual([
      { teamId: 1, externalSystemId: 2, externalId: '40 grinders' },
    ]);
  });

  it('inserts a team_eras row for an era not linked yet and returns the full set', async () => {
    existingEraRows = [];

    const result = await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === teamEras);
    expect(call?.values).toEqual([{ teamId: 1, eraId: 20 }]);
    expect(result.team.eras).toEqual([{ id: 100, eraId: 20 }]);
  });

  it('does not insert a team_eras row for an era already linked', async () => {
    existingEraRows = [{ eraId: 20 }];

    const result = await service.upsert(baseData);

    expect(insertCalls.some((c) => c.table === teamEras)).toBe(false);
    expect(result.team.eras).toEqual([{ eraId: 20 }]);
  });

  it('treats an omitted eras array as no era changes', async () => {
    existingEraRows = [{ eraId: 20 }];

    const result = await service.upsert({
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      eras: [],
      externalIds: [{ externalSystemId: 1, externalId: '40g' }],
    });

    expect(insertCalls.some((c) => c.table === teamEras)).toBe(false);
    expect(result.team.eras).toEqual([{ eraId: 20 }]);
  });

  describe('toplist queries', () => {
    function makeQueryBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      const chain = vi.fn(() => builder);
      builder.from = chain;
      builder.innerJoin = chain;
      builder.groupBy = chain;
      builder.orderBy = chain;
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject);
      return builder;
    }

    it('countMatchesPlayedByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 12 },
        { teamId: 2, name: 'Reikland Reavers', count: 7 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countMatchesPlayedByTeam()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });
  });
});
