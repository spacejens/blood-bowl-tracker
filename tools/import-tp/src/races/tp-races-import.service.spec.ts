import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RacesImportService,
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
import { TpRacesImportService } from './tp-races-import.service';

/** The numeric id the mocked bootstrap assigns to the TP external system. */
const TP_SYSTEM_ID = 1;

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertRace: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
  /** Era name -> DB id, as if already resolved via ReferenceLookupService. */
  eraIdsByName?: Map<string, number>;
  /** Overrides EraDataConfigService.getEras(), e.g. to model it throwing. */
  getEras?: () => EraDataConfig[];
}

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

async function makeService({
  bootstrap,
  upsertRace,
  getTpSystemName = () => 'TP',
  eraIdsByName = new Map([
    ['Fourth era', 100],
    ['Fifth era', 200],
  ]),
  getEras,
}: MakeServiceOptions): Promise<{
  service: TpRacesImportService;
  importResults: MockProxy<ImportResultService>;
  lookup: MockProxy<ReferenceLookupService>;
}> {
  const racesImport = mock<RacesImportService>();
  racesImport.upsert.mockImplementation(asProviderMethod(upsertRace));
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
  const lookup = mockReferenceLookupService(eraIdsByName, TP_SYSTEM_ID);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpRacesImportService,
      { provide: RacesImportService, useValue: racesImport },
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
    service: moduleRef.get(TpRacesImportService),
    importResults,
    lookup,
  };
}

const CHARACTERISTICS = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

interface RosterOpts {
  id: number;
  teamRace: string;
  raceName: string;
  positions?: { tpPositionId: number; name: string }[];
  coachTpId?: string;
}

function rosterEntry(era: string, opts: RosterOpts): RosterEntry {
  return {
    era,
    competition: 'comp',
    roster: {
      id: opts.id,
      teamName: `Team ${opts.id}`,
      teamRaceCode: opts.teamRace,
      raceName: opts.raceName,
      coachTpId: opts.coachTpId ?? 'coach-1',
      positions: (opts.positions ?? []).map((p) => ({
        ...p,
        characteristics: CHARACTERISTICS,
      })),
      starPositions: [],
      players: [],
    },
  };
}

function raceRecord(id: number) {
  return { id, name: 'X', eras: [], createdAt: new Date(), created: true };
}

function twoSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
}

describe('TpRacesImportService', () => {
  it('upserts a single-code race with its TP id, Name id and era', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const bootstrap = twoSystemUpsertMock();
    const { service, importResults } = await makeService({
      bootstrap,
      upsertRace,
    });

    await service.importRaces([
      rosterEntry('Fourth era', {
        id: 1,
        teamRace: 'Dwarf_BB2025',
        raceName: 'Dwarf',
      }),
    ]);

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toEqual([]);
    expect(upsertRace).toHaveBeenCalledTimes(1);
    expect(upsertRace).toHaveBeenCalledWith(
      {
        name: 'Dwarf',
        eras: [100],
        externalIds: [
          { externalSystemId: 1, externalId: 'Dwarf_BB2025' },
          { externalSystemId: 2, externalId: 'Dwarf' },
        ],
      },
      expect.any(Array),
    );
  });

  it('returns raceNamesById mapping each upserted race DB id to its display name', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(42));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    const { raceNamesById } = await service.importRaces([
      rosterEntry('Fourth era', {
        id: 1,
        teamRace: 'Necromantic_BB2025',
        raceName: 'Necromantic Horror',
      }),
    ]);

    expect(raceNamesById.get(42)).toBe('Necromantic Horror');
  });

  it('merges multiple codes for one race name into a single upsert call', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces([
      rosterEntry('Fourth era', {
        id: 1,
        teamRace: 'Dwarf',
        raceName: 'Dwarf',
      }),
      rosterEntry('Fifth era', {
        id: 2,
        teamRace: 'Dwarf_BB2025',
        raceName: 'Dwarf',
      }),
    ]);

    expect(upsertRace).toHaveBeenCalledTimes(1);
    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.name).toBe('Dwarf');
    expect(data.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Dwarf' },
      { externalSystemId: 1, externalId: 'Dwarf_BB2025' },
      { externalSystemId: 2, externalId: 'Dwarf' },
    ]);
    expect(data.eras).toEqual([100, 200]);
  });

  it('accumulates eras when one code appears under multiple eras', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces([
      rosterEntry('Fourth era', { id: 1, teamRace: 'Orc', raceName: 'Orc' }),
      rosterEntry('Fifth era', { id: 2, teamRace: 'Orc', raceName: 'Orc' }),
    ]);

    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Orc' },
      { externalSystemId: 2, externalId: 'Orc' },
    ]);
    expect(data.eras).toEqual([100, 200]);
  });

  it('records an error for a roster under an unknown era but still upserts the race', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces([
      rosterEntry('Ghost era', { id: 1, teamRace: 'Orc', raceName: 'Orc' }),
    ]);

    const { errors } = resultArgs(importResults);
    expect(errors.some((e) => e.message.includes('Ghost era'))).toBe(true);
    expect((upsertRace.mock.calls[0][0] as UpsertRace).eras).toEqual([]);
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertRace = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          item: { externalSystems: ['TP', 'Name'] },
          message: 'network timeout',
        },
      }),
      upsertRace,
    });

    await service.importRaces([
      rosterEntry('Fourth era', { id: 1, teamRace: 'Orc', raceName: 'Orc' }),
    ]);

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertRace).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    const { result } = await service.importRaces([
      rosterEntry('Fourth era', {
        id: 1,
        teamRace: 'Dwarf_BB2025',
        raceName: 'Dwarf',
      }),
    ]);

    expect(result).toBe(CANNED_RESULT);
  });

  it('resolves every configured era in one batched call', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service, lookup } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces([
      rosterEntry('Fourth era', {
        id: 1,
        teamRace: 'Dwarf',
        raceName: 'Dwarf',
      }),
    ]);

    expect(lookup.lookupMap).toHaveBeenCalledWith(
      'era',
      expect.arrayContaining([
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fourth era' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fifth era' },
      ]),
    );
  });

  it('records one error and imports nothing when the era config cannot be read', async () => {
    const upsertRace = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
    });

    await service.importRaces([
      rosterEntry('Fourth era', {
        id: 1,
        teamRace: 'Dwarf',
        raceName: 'Dwarf',
      }),
    ]);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TP_ERAS');
    expect(upsertRace).not.toHaveBeenCalled();
  });
});
