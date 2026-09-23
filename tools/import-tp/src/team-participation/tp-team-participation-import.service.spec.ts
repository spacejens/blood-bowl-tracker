import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ImportResultService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
} from '../import-package.test-helpers';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpTeamParticipationImportService } from './tp-team-participation-import.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

async function makeService(opts: {
  upsertCompetition: ReturnType<typeof vi.fn>;
}): Promise<{
  service: TpTeamParticipationImportService;
  importResults: MockProxy<ImportResultService>;
}> {
  const competitionsImport = mock<CompetitionsImportService>();
  competitionsImport.upsertCompetition.mockImplementation(
    asProviderMethod(opts.upsertCompetition),
  );
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpTeamParticipationImportService,
      { provide: CompetitionsImportService, useValue: competitionsImport },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpTeamParticipationImportService),
    importResults,
  };
}

/** An UpsertCompetition as competitions import builds it (TP id 111, era 100). */
function competition(
  overrides: Partial<UpsertCompetition> = {},
): UpsertCompetition {
  return {
    name: 'Chaos Cup 8',
    type: 'cup',
    eraId: 100,
    teamEraIds: [],
    externalIds: [{ externalSystemId: 1, externalId: '111' }],
    ...overrides,
  };
}

/** A roster entry tagged with era/competition directory strings. */
function roster(era: string, comp: string, id: number): RosterEntry {
  return {
    era,
    competition: comp,
    content: {},
    roster: {
      id,
      teamName: `Team ${id}`,
      teamRaceCode: 'Orc',
      raceName: 'Orc',
      coachTpId: 'coach-1',
      positions: [],
      starPositions: [],
      players: [],
    },
  };
}

describe('TpTeamParticipationImportService', () => {
  it('re-upserts a competition with the team eras of its own directory rosters', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const { service, importResults } = await makeService({
      upsertCompetition,
    });

    await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      teamErasByRosterId: new Map([
        [1, [{ id: 700, eraId: 100 }]],
        [2, [{ id: 701, eraId: 100 }]],
      ]),
      rosters: [
        roster('Fourth era', 'chaos-cup-8', 1),
        roster('Fourth era', 'chaos-cup-8', 2),
        // A roster from a different competition directory — must be excluded.
        roster('Fourth era', 'other-cup', 3),
      ],
    });

    expect(resultArgs(importResults).imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...competition(), teamEraIds: [700, 701] },
      expect.any(Array),
    );
  });

  it('resolves each competition against the era its own eraId names (multi-competition roster reuse)', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const { service } = await makeService({
      upsertCompetition,
    });

    const compA = competition({
      name: 'Comp A',
      eraId: 100,
      externalIds: [{ externalSystemId: 1, externalId: '111' }],
    });
    const compB = competition({
      name: 'Comp B',
      eraId: 200,
      externalIds: [{ externalSystemId: 1, externalId: '222' }],
    });

    await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [111, { upsert: compA, era: 'Fourth era', competition: 'comp-a' }],
        [222, { upsert: compB, era: 'Fifth era', competition: 'comp-b' }],
      ]),
      // Team id 5 played both competitions, so has a team_eras row per era.
      teamErasByRosterId: new Map([
        [
          5,
          [
            { id: 500, eraId: 100 },
            { id: 501, eraId: 200 },
          ],
        ],
      ]),
      rosters: [
        roster('Fourth era', 'comp-a', 5),
        roster('Fifth era', 'comp-b', 5),
      ],
    });

    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...compA, teamEraIds: [500] },
      expect.any(Array),
    );
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...compB, teamEraIds: [501] },
      expect.any(Array),
    );
  });

  it('records an error and skips a roster id it cannot resolve, still upserting the rest', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const { service, importResults } = await makeService({
      upsertCompetition,
    });

    await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      teamErasByRosterId: new Map([[1, [{ id: 700, eraId: 100 }]]]),
      rosters: [
        roster('Fourth era', 'chaos-cup-8', 1),
        roster('Fourth era', 'chaos-cup-8', 9), // no team_eras entry
      ],
    });

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...competition(), teamEraIds: [700] },
      expect.any(Array),
    );
    expect(errors.some((e) => e.message.includes('could not resolve'))).toBe(
      true,
    );
  });

  it('skips a competition with no matching rosters (no upsert)', async () => {
    const upsertCompetition = vi.fn();
    const { service, importResults } = await makeService({
      upsertCompetition,
    });

    await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      teamErasByRosterId: new Map([[1, [{ id: 700, eraId: 100 }]]]),
      // Rosters exist, but under a different competition directory.
      rosters: [roster('Fourth era', 'other-cup', 1)],
    });

    expect(resultArgs(importResults).imported).toBe(0);
    expect(upsertCompetition).not.toHaveBeenCalled();
  });

  it('does not count a competition as imported when its re-upsert reports failure', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(false);
    const { service, importResults } = await makeService({
      upsertCompetition,
    });

    await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      teamErasByRosterId: new Map([[1, [{ id: 700, eraId: 100 }]]]),
      rosters: [roster('Fourth era', 'chaos-cup-8', 1)],
    });

    expect(resultArgs(importResults).imported).toBe(0);
    expect(upsertCompetition).toHaveBeenCalledTimes(1);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const { service } = await makeService({ upsertCompetition });

    const { result } = await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      teamErasByRosterId: new Map([[1, [{ id: 700, eraId: 100 }]]]),
      rosters: [roster('Fourth era', 'chaos-cup-8', 1)],
    });

    expect(result).toBe(CANNED_RESULT);
  });
});
