import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
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
import { TpPositionsImportService } from './tp-positions-import.service';

/** The numeric id the mocked bootstrap assigns to the TP external system. */
const TP_SYSTEM_ID = 1;

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

interface MakeServiceOptions {
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
}

async function makeService({
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
    ['Dwarf_BB2025', 50],
    ['Human', 60],
    ['HU-1', 7],
  ]),
  getEras,
}: MakeServiceOptions): Promise<{
  service: TpPositionsImportService;
  importResults: MockProxy<ImportResultService>;
  nameExternalId: MockProxy<NameExternalIdService>;
  lookup: MockProxy<ReferenceLookupService>;
}> {
  const positionsImport = mock<PositionsImportService>();
  positionsImport.upsertPosition.mockImplementation(
    asProviderMethod(upsertPosition),
  );
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
  const rosterCollection = mock<RosterCollectionService>();
  rosterCollection.unknownEraError.mockImplementation((era, roster) => ({
    item: { era, roster: roster.id },
    message: `Unknown era "${era}" for roster ${roster.id}: not found among imported eras.`,
  }));
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
      { provide: RosterCollectionService, useValue: rosterCollection },
      { provide: ImportResultService, useValue: importResults },
      { provide: EraDataConfigService, useValue: eraDataConfig },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpPositionsImportService),
    importResults,
    nameExternalId,
    lookup,
  };
}

interface RosterOpts {
  teamRace: string;
  raceName: string;
  positions: { tpPositionId: number; name: string }[];
  starPositions?: { tpPositionId: number; name: string }[];
  id?: number;
}

function rosterEntry(era: string, opts: RosterOpts): RosterEntry {
  const { teamRace, raceName, positions, starPositions = [], id = 1 } = opts;
  return {
    era,
    competition: 'comp',
    roster: {
      id,
      teamName: `Team ${id}`,
      teamRaceCode: teamRace,
      raceName,
      coachTpId: 'coach-1',
      positions,
      starPositions,
      players: [],
    },
  };
}

function positionRecord(id: number) {
  return {
    id,
    name: 'X',
    isStarPlayer: false,
    createdAt: new Date(),
    created: true,
  };
}

function oneSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
}

describe('TpPositionsImportService', () => {
  it('dedupes the same position name under the same code into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const bootstrap = oneSystemUpsertMock();
    const { service, importResults, nameExternalId } = await makeService({
      bootstrap,
      upsertPosition,
      syncRaceEras,
    });
    nameExternalId.forPosition.mockReturnValueOnce('name-id-blocker');

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 2,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(resultArgs(importResults).imported).toBe(1);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Dwarf Blocker Lineman',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '280' },
          { externalSystemId: 2, externalId: 'name-id-blocker' },
        ],
      },
      expect.any(Array),
    );
    expect(nameExternalId.forPosition).toHaveBeenCalledWith(
      'Dwarf',
      'Dwarf Blocker Lineman',
    );
  });

  it('merges the same position name across rule-set codes of one race into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1, 2] });
    const { service, nameExternalId } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });
    nameExternalId.forPosition.mockReturnValueOnce('name-id-runner');

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 281, name: 'Dwarf Runner' }],
          id: 1,
        }),
        rosterEntry('Fifth era', {
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 954, name: 'Dwarf Runner' }],
          id: 2,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(
      (upsertPosition.mock.calls[0][0] as UpsertPosition).externalIds,
    ).toEqual([
      { externalSystemId: 1, externalId: '281' },
      { externalSystemId: 1, externalId: '954' },
      { externalSystemId: 2, externalId: 'name-id-runner' },
    ]);
    expect(nameExternalId.forPosition).toHaveBeenCalledWith(
      'Dwarf',
      'Dwarf Runner',
    );
    expect(syncRaceEras).toHaveBeenCalledWith(
      {
        positionId: 70,
        raceEras: [
          { raceId: 50, eraId: 100 },
          { raceId: 50, eraId: 200 },
        ],
      },
      expect.any(Array),
    );
  });

  it('keeps differently-named variants as two rows', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
        rosterEntry('Fifth era', {
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 952, name: 'Dwarf Lineman' }],
          id: 2,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(resultArgs(importResults).imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledTimes(2);
  });

  it('skips a roster and records an error when its race cannot be resolved', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
      raceIdsByCode: new Map(),
    });

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ],
      { raceNamesById: new Map() },
    );

    expect(upsertPosition).not.toHaveBeenCalled();
    const { errors } = resultArgs(importResults);
    expect(
      errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          item: { externalSystems: ['TP'] },
          message: 'network timeout',
        },
      }),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ externalSystems: ['TP'] });
    expect(upsertPosition).not.toHaveBeenCalled();
  });

  it('records an unknown-era error but still imports the position when era cannot be resolved', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [] });
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        rosterEntry('Unknown era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    const { errors } = resultArgs(importResults);
    expect(errors.some((e) => e.message.toLowerCase().includes('era'))).toBe(
      true,
    );
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 70, raceEras: [] },
      expect.any(Array),
    );
  });

  it('imports a star position grouped by name (not race) with a bare-name external id and no syncRaceEras', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { starPositionIds } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [],
          starPositions: [{ tpPositionId: 5002, name: "Morg 'n' Thorg" }],
          id: 1,
        }),
        rosterEntry('Fourth era', {
          teamRace: 'Human',
          raceName: 'Human',
          positions: [],
          starPositions: [{ tpPositionId: 5002, name: "Morg 'n' Thorg" }],
          id: 2,
        }),
      ],
      {
        raceNamesById: new Map([
          [50, 'Dwarf'],
          [60, 'Human'],
        ]),
      },
    );

    expect(resultArgs(importResults).imported).toBe(1);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: "Morg 'n' Thorg",
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 1, externalId: "Morg 'n' Thorg" },
          { externalSystemId: 1, externalId: '5002' },
          { externalSystemId: 2, externalId: "Morg 'n' Thorg" },
        ],
      },
      expect.any(Array),
    );
    expect(syncRaceEras).not.toHaveBeenCalled();
    expect(starPositionIds).toEqual(new Set([800]));
  });

  it('returns the DB ids of upserted star positions in starPositionIds', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi.fn();
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { starPositionIds } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [],
          starPositions: [{ tpPositionId: 5002, name: "Morg 'n' Thorg" }],
          id: 1,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(starPositionIds).toEqual(new Set([800]));
  });

  it('attaches the Name external id NameExternalIdService.forPosition returns to regular positions', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, nameExternalId } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });
    nameExternalId.forPosition.mockReturnValueOnce('name-id-lineman');

    const rosters = [
      rosterEntry('Fourth era', {
        teamRace: 'HU-1',
        raceName: 'Human',
        positions: [{ tpPositionId: 100, name: 'Lineman' }],
        id: 1,
      }),
    ];
    const raceNamesById = new Map([[7, 'Human']]);

    await service.importPositions(rosters, { raceNamesById });
    const data = upsertPosition.mock.calls[0][0] as UpsertPosition;
    expect(data.externalIds).toContainEqual({
      externalSystemId: 2, // Name system id
      externalId: 'name-id-lineman',
    });
    expect(nameExternalId.forPosition).toHaveBeenCalledWith('Human', 'Lineman');
  });

  it('tags star positions under the Name system with a bare name', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi.fn();
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const rostersWithStar = [
      rosterEntry('Fourth era', {
        teamRace: 'HU-1',
        raceName: 'Human',
        positions: [],
        starPositions: [{ tpPositionId: 5001, name: 'Griff Oberwald' }],
        id: 1,
      }),
    ];
    const raceNamesById = new Map([[7, 'Human']]);

    await service.importPositions(rostersWithStar, { raceNamesById });
    const starData = upsertPosition.mock.calls
      .map((c) => c[0] as UpsertPosition)
      .find((d) => d.isStarPlayer);
    expect(starData?.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Griff Oberwald' },
      { externalSystemId: 1, externalId: '5001' },
      { externalSystemId: 2, externalId: 'Griff Oberwald' },
    ]);
  });

  it('registers every numeric TP position id seen for a star as an extra TP external id', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi.fn();
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [],
          starPositions: [{ tpPositionId: 388, name: "Morg 'n' Thorg" }],
          id: 1,
        }),
        rosterEntry('Fourth era', {
          teamRace: 'Human',
          raceName: 'Human',
          positions: [],
          starPositions: [{ tpPositionId: 512, name: "Morg 'n' Thorg" }],
          id: 2,
        }),
      ],
      {
        raceNamesById: new Map([
          [50, 'Dwarf'],
          [60, 'Human'],
        ]),
      },
    );

    const starData = upsertPosition.mock.calls
      .map((c) => c[0] as UpsertPosition)
      .find((d) => d.isStarPlayer);
    expect(starData?.externalIds).toEqual([
      { externalSystemId: 1, externalId: "Morg 'n' Thorg" },
      { externalSystemId: 1, externalId: '388' },
      { externalSystemId: 1, externalId: '512' },
      { externalSystemId: 2, externalId: "Morg 'n' Thorg" },
    ]);
  });

  it('records an error and omits the Name id when the race name cannot be resolved', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const rosters = [
      rosterEntry('Fourth era', {
        teamRace: 'HU-1',
        raceName: 'Human',
        positions: [{ tpPositionId: 100, name: 'Lineman' }],
        id: 1,
      }),
    ];

    // raceNamesById intentionally missing the group's raceId
    await service.importPositions(rosters, { raceNamesById: new Map() });
    expect(resultArgs(importResults).errors.length).toBeGreaterThan(0);
    const data = upsertPosition.mock.calls[0][0] as UpsertPosition;
    expect(data.externalIds.some((e) => e.externalSystemId === 2)).toBe(false); // no Name id attached; TP-system id(s) still present
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(result).toBe(CANNED_RESULT);
  });

  it('resolves every configured era in one batched call', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, lookup } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(lookup.lookupMap).toHaveBeenCalledWith(
      'era',
      expect.arrayContaining([
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fourth era' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fifth era' },
      ]),
    );
  });

  it('resolves every distinct roster race code in one batched call', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1, 2] });
    const { service, lookup } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
        rosterEntry('Fifth era', {
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 954, name: 'Dwarf Runner' }],
          id: 2,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(lookup.lookupMap).toHaveBeenCalledWith(
      'race',
      expect.arrayContaining([
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Dwarf' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Dwarf_BB2025' },
      ]),
    );
  });

  it('records one error and imports nothing when the era config cannot be read', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
    });

    await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TP_ERAS');
    expect(upsertPosition).not.toHaveBeenCalled();
  });
});
