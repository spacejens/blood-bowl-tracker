import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
} from '../import-package.test-helpers';
import type { StarPositionUsage } from '../players/tp-players-import.service';
import { TpPositionRaceErasImportService } from './tp-position-race-eras-import.service';

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

async function makeService(syncRaceEras: ReturnType<typeof vi.fn>): Promise<{
  service: TpPositionRaceErasImportService;
  importResults: MockProxy<ImportResultService>;
}> {
  const positionsImport = mock<PositionsImportService>();
  positionsImport.syncRaceEras.mockImplementation(
    asProviderMethod(syncRaceEras),
  );
  const importResults = mockImportResultService();
  // Overrides the shared helper's mirrored `result` with a canned value (a
  // later stub wins). ImportResultService.result's own success derivation is
  // covered by packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpPositionRaceErasImportService,
      { provide: PositionsImportService, useValue: positionsImport },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpPositionRaceErasImportService),
    importResults,
  };
}

const raceIdsByTeamRaceCode = new Map<string, number>([
  ['Dwarf', 50],
  ['Human', 60],
]);
const eraIdsByName = new Map<string, number>([
  ['Third Era', 500],
  ['Fourth era', 600],
]);

describe('TpPositionRaceErasImportService', () => {
  it('syncs one star position with every distinct (race, era) pair it was fielded on', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1, 2] });
    const { service, importResults } = await makeService(syncRaceEras);
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
      { positionId: 800, teamRaceCode: 'Human', era: 'Fourth era' },
    ];

    await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(syncRaceEras).toHaveBeenCalledTimes(1);
    expect(syncRaceEras).toHaveBeenCalledWith(
      {
        positionId: 800,
        raceEras: [
          { raceId: 50, eraId: 500 },
          { raceId: 60, eraId: 600 },
        ],
      },
      expect.any(Array),
    );
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(0);
  });

  it('dedupes repeated usages of the same (race, era) pair for a position', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1] });
    const { service } = await makeService(syncRaceEras);
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
    ];

    await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 800, raceEras: [{ raceId: 50, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('makes no syncRaceEras call when there are no star position usages', async () => {
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService(syncRaceEras);

    await service.syncStarPositionRaceEras({
      starPositionUsages: [],
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(syncRaceEras).not.toHaveBeenCalled();
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('groups usages per position into separate syncRaceEras calls', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 0, raceEraIds: [1] });
    const { service, importResults } = await makeService(syncRaceEras);
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
      { positionId: 810, teamRaceCode: 'Human', era: 'Fourth era' },
    ];

    await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(syncRaceEras).toHaveBeenCalledTimes(2);
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 800, raceEras: [{ raceId: 50, eraId: 500 }] },
      expect.any(Array),
    );
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 810, raceEras: [{ raceId: 60, eraId: 600 }] },
      expect.any(Array),
    );
    expect(resultArgs(importResults).imported).toBe(2);
  });

  it('records an ImportError and skips a usage whose race code cannot be resolved, still processing the rest', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1] });
    const { service, importResults } = await makeService(syncRaceEras);
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'UnknownRace', era: 'Third Era' },
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
    ];

    await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('UnknownRace');
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 800, raceEras: [{ raceId: 50, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('records an ImportError and skips a usage whose era cannot be resolved', async () => {
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService(syncRaceEras);
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Unknown Era' },
    ];

    await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('Unknown Era');
    // The only usage errored out, so no position had any resolvable pair.
    expect(syncRaceEras).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1, 2] });
    const { service } = await makeService(syncRaceEras);
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
    ];

    const { result } = await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(result).toBe(CANNED_RESULT);
  });
});
