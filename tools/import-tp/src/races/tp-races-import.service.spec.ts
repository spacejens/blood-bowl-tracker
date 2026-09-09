import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RacesImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { TpOfficialRace } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import {
  asProviderMethod,
  mockImportResultService,
  mockNameExternalIdService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { OfficialTeamsEntry } from '../source/official-teams-collection.service';
import { TpRacesImportService } from './tp-races-import.service';

/** The numeric id the mocked bootstrap assigns to the TP external system. */
const TP_SYSTEM_ID = 1;

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertRace: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
  /** Era name -> DB id, as if already resolved via ReferenceLookupService. */
  eraIdsByName?: Map<string, number>;
  /** Overrides EraDataConfigService.getEras(), e.g. to model custom eras or a throw. */
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
    ['Third era', 100],
    ['Fourth era', 200],
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
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);
  const eraDataConfig = mock<EraDataConfigService>();
  eraDataConfig.getEras.mockImplementation(
    getEras ??
      (() => [
        {
          name: 'Third era',
          dataSubdir: 'third',
          rulesSets: ['BB2020'],
          startDate: '2020-01-01',
        },
        {
          name: 'Fourth era',
          dataSubdir: 'fourth',
          rulesSets: ['BB2025'],
          startDate: '2025-01-01',
        },
      ]),
  );
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

function officialRace(name: string, teamRaceCode: string): TpOfficialRace {
  return { name, teamRaceCode, isOfficial: true, positions: [] };
}

function officialTeamsEntry(
  raceName: string,
  teamRaceCode: string,
  rulesSet: string,
): OfficialTeamsEntry {
  return { race: officialRace(raceName, teamRaceCode), rulesSet };
}

function raceRecord(id: number) {
  return { id, name: 'X', eras: [], createdAt: new Date(), created: true };
}

function twoSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
}

describe('TpRacesImportService', () => {
  it('groups official-list entries by display name and upserts one race per group', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces([
      officialTeamsEntry('Amazon', 'Amazon_BB2020', 'BB2020'),
      officialTeamsEntry('Amazon', 'Amazon_BB2025', 'BB2025'),
    ]);

    expect(upsertRace).toHaveBeenCalledTimes(1);
    expect(upsertRace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Amazon' }),
      expect.anything(),
    );
  });

  it('carries every distinct teamRaceCode as a TP external id, plus a Name external id', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces([
      officialTeamsEntry('Amazon', 'Amazon_BB2020', 'BB2020'),
      officialTeamsEntry('Amazon', 'Amazon_BB2025', 'BB2025'),
    ]);

    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.externalIds).toEqual(
      expect.arrayContaining([
        { externalSystemId: 1, externalId: 'Amazon_BB2020' },
        { externalSystemId: 1, externalId: 'Amazon_BB2025' },
        { externalSystemId: 2, externalId: 'Amazon' },
      ]),
    );
    expect(data.externalIds).toHaveLength(3);
  });

  it('sets eras to the union of every era declaring any of the race rules sets', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
      eraIdsByName: new Map([
        ['Third era', 100],
        ['Fourth era', 200],
        ['Second Dungeon Bowl era', 300],
      ]),
      getEras: () => [
        {
          name: 'Third era',
          dataSubdir: 'third',
          rulesSets: ['BB2020'],
          startDate: '2020-01-01',
        },
        {
          name: 'Fourth era',
          dataSubdir: 'fourth',
          rulesSets: ['BB2025'],
          startDate: '2025-01-01',
        },
        {
          name: 'Second Dungeon Bowl era',
          dataSubdir: 'db2',
          rulesSets: ['DB2021'],
          startDate: '2021-01-01',
        },
      ],
    });

    await service.importRaces([
      officialTeamsEntry('Amazon', 'Amazon_BB2020', 'BB2020'),
      officialTeamsEntry('Amazon', 'Amazon_BB2025', 'BB2025'),
    ]);

    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.eras).toEqual(expect.arrayContaining([100, 200]));
    expect(data.eras).toHaveLength(2);
  });

  it('matches a rules set folder name against the configured rules set case-insensitively', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
      eraIdsByName: new Map([['Third era', 100]]),
      getEras: () => [
        {
          name: 'Third era',
          dataSubdir: 'third',
          rulesSets: ['BB2020'],
          startDate: '2020-01-01',
        },
      ],
    });

    await service.importRaces([
      officialTeamsEntry('Amazon', 'Amazon_BB2020', 'bb2020'),
    ]);

    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.eras).toEqual([100]);
  });

  it('records an error and imports the race with no eras when its rules set matches no configured era', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces([
      officialTeamsEntry('Amazon', 'Amazon_BB2019', 'BB2019'),
    ]);

    const { errors } = resultArgs(importResults);
    expect(errors.some((e) => e.message.includes('BB2019'))).toBe(true);
    expect((upsertRace.mock.calls[0][0] as UpsertRace).eras).toEqual([]);
  });

  it('records an error and skips the eras when an era name cannot be resolved to a DB id', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
      eraIdsByName: new Map(),
    });

    await service.importRaces([
      officialTeamsEntry('Amazon', 'Amazon_BB2020', 'BB2020'),
    ]);

    const { errors } = resultArgs(importResults);
    expect(errors.some((e) => e.message.includes('Third era'))).toBe(true);
    expect((upsertRace.mock.calls[0][0] as UpsertRace).eras).toEqual([]);
  });

  it('returns raceNamesById mapping each upserted race id to its display name', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(42));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    const { raceNamesById } = await service.importRaces([
      officialTeamsEntry('Amazon', 'Amazon_BB2020', 'BB2020'),
    ]);

    expect(raceNamesById.get(42)).toBe('Amazon');
  });

  it('returns a failed result and no upserts when the external system bootstrap fails', async () => {
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
      officialTeamsEntry('Amazon', 'Amazon_BB2020', 'BB2020'),
    ]);

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertRace).not.toHaveBeenCalled();
  });

  it('returns a failed result when the era config throws', async () => {
    const upsertRace = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
    });

    await service.importRaces([
      officialTeamsEntry('Amazon', 'Amazon_BB2020', 'BB2020'),
    ]);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TP_ERAS');
    expect(upsertRace).not.toHaveBeenCalled();
  });
});
