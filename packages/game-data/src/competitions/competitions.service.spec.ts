import {
  competitionExternalIds,
  competitions,
  competitionTeams,
  DB,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CompetitionsService,
  CompetitionUpsertConflictError,
} from './competitions.service';

const fakeCompetition = {
  id: 1,
  name: 'Major Season 24',
  type: 'season',
  eraId: 20,
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

describe('CompetitionsService', () => {
  let service: CompetitionsService;
  let externalIdRows: unknown[];
  let existingTeamEraRows: { teamEraId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingTeamEraRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === competitionExternalIds
              ? externalIdRows
              : existingTeamEraRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakeCompetition]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({
              returning: () => Promise.resolve([fakeCompetition]),
            }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [CompetitionsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(CompetitionsService);
  });

  const baseData = {
    name: 'Major Season 24',
    type: 'season' as const,
    eraId: 20,
    teamEraIds: [100, 101],
    externalIds: [
      { externalSystemId: 1, externalId: '73' },
      { externalSystemId: 2, externalId: 'Major Season 24' },
    ],
  };

  it('creates a new competition with its team-era links when no external IDs match', async () => {
    const result = await service.upsert(baseData);

    expect(result).toEqual({
      competition: { ...fakeCompetition, teamEraIds: [100, 101] },
      created: true,
    });
    expect(insertCalls.some((c) => c.table === competitions)).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts the competition with its name, type and eraId', async () => {
    await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === competitions);
    expect(call?.values).toEqual({
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
    });
  });

  it('updates the matching competition when exactly one external ID matches', async () => {
    externalIdRows = [
      { competitionId: 1, externalSystemId: 1, externalId: '73' },
    ];

    const result = await service.upsert(baseData);

    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === competitions)).toBe(true);
  });

  it('throws CompetitionUpsertConflictError when external IDs match different competitions', async () => {
    externalIdRows = [
      { competitionId: 1, externalSystemId: 1, externalId: '73' },
      { competitionId: 2, externalSystemId: 2, externalId: 'Major Season 24' },
    ];

    await expect(service.upsert(baseData)).rejects.toThrow(
      CompetitionUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts only the competition_teams rows that are new', async () => {
    existingTeamEraRows = [{ teamEraId: 100 }];

    const result = await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === competitionTeams);
    expect(call?.values).toEqual([{ competitionId: 1, teamEraId: 101 }]);
    expect(result.competition.teamEraIds).toEqual([100, 101]);
  });

  it('does not insert competition_teams rows when all links already exist', async () => {
    existingTeamEraRows = [{ teamEraId: 100 }, { teamEraId: 101 }];

    const result = await service.upsert(baseData);

    expect(insertCalls.some((c) => c.table === competitionTeams)).toBe(false);
    expect(result.competition.teamEraIds).toEqual([100, 101]);
  });
});
