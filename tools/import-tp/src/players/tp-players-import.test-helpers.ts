import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PlayersImportService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import {
  asProviderMethod,
  mockEraDataConfigService,
  mockImportResultService,
  mockNameExternalIdService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { RosterCollectionService } from '../source/roster-collection.service';
import { TpPlayersImportService } from './tp-players-import.service';

/** The numeric id the mocked bootstrap assigns to the TP external system. */
export const TP_SYSTEM_ID = 1;

export interface MakeServiceOptions {
  upsertPlayerResult: ReturnType<typeof vi.fn>;
  bootstrap?: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
  upsertPosition?: ReturnType<typeof vi.fn>;
  /** Era name -> DB id, as if already resolved via ReferenceLookupService. */
  eraIdsByName?: Map<string, number>;
  /**
   * lineUpMasterId (stringified) -> DB position id, as if already resolved
   * via ReferenceLookupService's 'position' kind.
   */
  positionIdsByExternalId?: Map<string, number>;
  /** Overrides EraDataConfigService.getEras(), e.g. to model it throwing. */
  getEras?: () => EraDataConfig[];
}

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; the specs
 * assert what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged.
 */
export const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The canned ImportError the mocked RosterCollectionService.unknownEraError returns. */
export const CANNED_UNKNOWN_ERA_ERROR: ImportError = {
  item: { canned: true },
  message: 'canned unknown era error',
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
export function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

export async function makeService({
  upsertPlayerResult,
  bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] }),
  getTpSystemName = () => 'TP',
  upsertPosition = vi.fn(),
  eraIdsByName = new Map([
    ['Third Era', 500],
    ['Fourth Era', 501],
  ]),
  positionIdsByExternalId = new Map([['952', 200]]),
  getEras,
}: MakeServiceOptions): Promise<{
  service: TpPlayersImportService;
  importResults: MockProxy<ImportResultService>;
  lookup: MockProxy<ReferenceLookupService>;
}> {
  const playersImport = mock<PlayersImportService>();
  playersImport.upsertPlayerResult.mockImplementation(
    asProviderMethod(upsertPlayerResult),
  );
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockImplementation(getTpSystemName);
  const positionsImport = mock<PositionsImportService>();
  positionsImport.upsertPosition.mockImplementation(
    asProviderMethod(upsertPosition),
  );
  const nameExternalId = mockNameExternalIdService();
  const rosterCollection = mock<RosterCollectionService>();
  rosterCollection.unknownEraError.mockReturnValue(CANNED_UNKNOWN_ERA_ERROR);
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);
  const eraDataConfig = mockEraDataConfigService([...eraIdsByName.keys()]);
  if (getEras) {
    eraDataConfig.getEras.mockImplementation(getEras);
  }
  const lookup = mockReferenceLookupService(eraIdsByName, TP_SYSTEM_ID, {
    positionIdsByExternalId,
  });

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpPlayersImportService,
      { provide: PlayersImportService, useValue: playersImport },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: PositionsImportService, useValue: positionsImport },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: RosterCollectionService, useValue: rosterCollection },
      { provide: ImportResultService, useValue: importResults },
      { provide: EraDataConfigService, useValue: eraDataConfig },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpPlayersImportService),
    importResults,
    lookup,
  };
}

/** A single-roster, single-player fixture reused across specs that don't care
 * about the player's specific data. */
export const rosters: RosterEntry[] = [
  {
    era: 'Third Era',
    competition: 'comp',
    roster: {
      id: 123,
      teamName: 'Team 123',
      teamRaceCode: 'Dwarf',
      raceName: 'Dwarf',
      coachTpId: 'coach-1',
      positions: [{ tpPositionId: 952, name: 'Dwarf Lineman' }],
      starPositions: [],
      players: [
        {
          id: 2412443,
          name: 'The Agitated Deviation',
          number: 4,
          lineUpMasterId: 952,
          rosterId: 123,
          fallbackPositionName: 'Dwarf Lineman',
          isBigGuy: false,
          totalStarPlayerPoints: 23,
        },
      ],
    },
  },
];
