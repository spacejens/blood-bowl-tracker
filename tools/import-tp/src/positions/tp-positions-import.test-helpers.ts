/**
 * Shared harness for the TpPositionsImportService specs. Extracted so the
 * position-grouping spec and the characteristics-writing spec can build the
 * same subject without either file approaching the 1000-line spec cap.
 */
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type {
  TpOfficialPosition,
  TpPositionCharacteristics,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { TpEraRulesSetResolverService } from '../eras/tp-era-rules-set-resolver.service';
import {
  asProviderMethod,
  mockImportResultService,
  mockNameExternalIdService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { OfficialTeamsEntry } from '../source/official-teams-collection.service';
import { TpPositionsImportService } from './tp-positions-import.service';

/** The numeric id the mocked bootstrap assigns to the TP external system. */
export const TP_SYSTEM_ID = 1;

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged.
 */
export const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
export function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

export interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertPosition: ReturnType<typeof vi.fn>;
  syncRaceEras: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
  /** Era name -> DB id, as if already resolved via ReferenceLookupService. */
  eraIdsByName?: Map<string, number>;
  /** Team race code -> DB race id, as if already resolved via ReferenceLookupService. */
  raceIdsByCode?: Map<string, number>;
  /** Overrides EraDataConfigService.getEras(), e.g. to model it throwing. */
  getEras?: () => EraDataConfig[];
  /**
   * The map the mocked TpEraRulesSetResolverService returns: era name -> rules
   * set DB id. An era absent from it models the resolver having skipped it
   * (zero or several declared rules sets, or an unresolvable name) -- that
   * resolution logic has its own spec at
   * ../eras/tp-era-rules-set-resolver.service.spec.ts.
   */
  rulesSetIdByEraName?: Map<string, number>;
}

/**
 * Default two-era config: `Fourth era` declares BB2020, `Fifth era` declares
 * BB2025 -- one rules set each, matching how `officialTeamsEntry`'s
 * `rulesSet` values are expected to be resolved against.
 */
const DEFAULT_ERAS: EraDataConfig[] = [
  {
    name: 'Fourth era',
    dataSubdir: 'fourth-era',
    rulesSets: ['BB2020'],
    startDate: '2020-01-01',
  },
  {
    name: 'Fifth era',
    dataSubdir: 'fifth-era',
    rulesSets: ['BB2025'],
    startDate: '2025-01-01',
  },
];

export async function makeService({
  bootstrap,
  upsertPosition,
  syncRaceEras,
  getTpSystemName = () => 'TP',
  eraIdsByName = new Map([
    ['Fourth era', 100],
    ['Fifth era', 200],
  ]),
  raceIdsByCode = new Map([
    ['Dwarf', 50],
    ['Human', 60],
  ]),
  getEras = () => DEFAULT_ERAS,
  rulesSetIdByEraName = new Map([
    ['Fourth era', 900],
    ['Fifth era', 901],
  ]),
}: MakeServiceOptions): Promise<{
  service: TpPositionsImportService;
  importResults: MockProxy<ImportResultService>;
  nameExternalId: MockProxy<NameExternalIdService>;
  lookup: MockProxy<ReferenceLookupService>;
}> {
  const positionsImport = mock<PositionsImportService>();
  positionsImport.upsert.mockImplementation(asProviderMethod(upsertPosition));
  positionsImport.syncRaceEras.mockImplementation(
    asProviderMethod(syncRaceEras),
  );
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockImplementation(getTpSystemName);
  const nameExternalId = mockNameExternalIdService();
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);
  const eraDataConfig = mock<EraDataConfigService>();
  eraDataConfig.getEras.mockImplementation(getEras);
  const eraRulesSetResolver = mock<TpEraRulesSetResolverService>();
  eraRulesSetResolver.resolveRulesSetIdByEraName.mockResolvedValue(
    rulesSetIdByEraName,
  );
  const lookup = mockReferenceLookupService(eraIdsByName, TP_SYSTEM_ID, {
    raceIdsByCode,
  });

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpPositionsImportService,
      { provide: PositionsImportService, useValue: positionsImport },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: EraDataConfigService, useValue: eraDataConfig },
      { provide: ReferenceLookupService, useValue: lookup },
      {
        provide: TpEraRulesSetResolverService,
        useValue: eraRulesSetResolver,
      },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpPositionsImportService),
    importResults,
    nameExternalId,
    lookup,
  };
}

/** A stand-in characteristics set for grouping tests that don't assert on them. */
export const DEFAULT_CHARACTERISTICS: TpPositionCharacteristics = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

export interface OfficialPositionOpts {
  name: string;
  isStarPlayer?: boolean;
  tpPositionId?: number;
  characteristics?: TpPositionCharacteristics;
}

export function officialPosition(
  opts: OfficialPositionOpts,
): TpOfficialPosition {
  const {
    name,
    isStarPlayer = false,
    tpPositionId,
    characteristics = DEFAULT_CHARACTERISTICS,
  } = opts;
  return {
    name,
    isStarPlayer,
    ...(tpPositionId === undefined ? {} : { tpPositionId }),
    characteristics,
  };
}

export interface OfficialTeamsEntryOpts {
  raceName: string;
  teamRaceCode: string;
  rulesSet: string;
  positions: TpOfficialPosition[];
  /** Defaults to `true` (an official roster), matching the common case. */
  isOfficial?: boolean;
}

export function officialTeamsEntry(
  opts: OfficialTeamsEntryOpts,
): OfficialTeamsEntry {
  const {
    raceName,
    teamRaceCode,
    rulesSet,
    positions,
    isOfficial = true,
  } = opts;
  return {
    race: { name: raceName, teamRaceCode, isOfficial, positions },
    rulesSet,
  };
}

export function positionRecord(id: number) {
  return {
    id,
    name: 'X',
    isStarPlayer: false,
    createdAt: new Date(),
    created: true,
  };
}

export function oneSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
}
