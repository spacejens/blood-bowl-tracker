import type {
  ExternalSystemBootstrapResult,
  ImportError,
} from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  RacesImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  mockImportResultService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import type { TpExternalSystemNameProvider } from '../tp-import-providers';
import { TP_EXTERNAL_SYSTEM_NAME_PROVIDER } from '../tp-import-providers';
import { TpEraResolutionService } from './tp-era-resolution.service';

const TP_SYSTEM_ID = 1;

const ROSTER: TpRoster = {
  id: 5,
  teamName: 'Da Boyz',
  teamRaceCode: 'Orc',
  raceName: 'Orc',
  coachTpId: 'guid-c',
  positions: [],
  starPositions: [],
  players: [],
};

interface MakeServiceOptions {
  /** TP race code -> DB race id, as if already resolved via ReferenceLookupService. */
  raceIdsByCode?: Map<string, number>;
  /** TP era name -> DB era id, as if already resolved via ReferenceLookupService. */
  eraIdsByName?: Map<string, number>;
  bootstrapResult?: ExternalSystemBootstrapResult;
}

async function makeService({
  raceIdsByCode = new Map([['Orc', 50]]),
  eraIdsByName = new Map([['Fourth era', 99]]),
  bootstrapResult = { ok: true, ids: [TP_SYSTEM_ID] },
}: MakeServiceOptions = {}): Promise<{
  service: TpEraResolutionService;
  externalSystemBootstrap: MockProxy<ExternalSystemBootstrapService>;
  lookup: MockProxy<ReferenceLookupService>;
  racesImport: MockProxy<RacesImportService>;
}> {
  const externalSystemName = mock<TpExternalSystemNameProvider>();
  externalSystemName.getTpSystemName.mockReturnValue('TP');
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockResolvedValue(bootstrapResult);
  const lookup = mockReferenceLookupService(eraIdsByName, TP_SYSTEM_ID, {
    raceIdsByCode,
  });
  const racesImport = mock<RacesImportService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpEraResolutionService,
      {
        provide: TP_EXTERNAL_SYSTEM_NAME_PROVIDER,
        useValue: externalSystemName,
      },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      { provide: ReferenceLookupService, useValue: lookup },
      { provide: RacesImportService, useValue: racesImport },
      { provide: ImportResultService, useValue: mockImportResultService() },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpEraResolutionService),
    externalSystemBootstrap,
    lookup,
    racesImport,
  };
}

describe('TpEraResolutionService', () => {
  it('uses an explicitly given era once it validates against the DB', async () => {
    const { service, externalSystemBootstrap, lookup, racesImport } =
      await makeService();
    const errors: ImportError[] = [];

    const era = await service.resolveEra({
      roster: ROSTER,
      era: 'Fourth era',
      errors,
    });

    expect(era).toBe('Fourth era');
    expect(externalSystemBootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
    ]);
    expect(lookup.lookupMap).toHaveBeenCalledWith('era', [
      { externalSystemId: TP_SYSTEM_ID, externalId: 'Fourth era' },
    ]);
    expect(racesImport.listOngoingEras).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('records one error when the explicitly given era does not exist', async () => {
    const { service, racesImport } = await makeService({
      eraIdsByName: new Map(),
    });
    const errors: ImportError[] = [];

    const era = await service.resolveEra({
      roster: ROSTER,
      era: 'Nonexistent era',
      errors,
    });

    expect(era).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { team: 5, era: 'Nonexistent era' },
        message:
          'Could not resolve an era for team "Da Boyz": era "Nonexistent era" does not exist',
      },
    ]);
    expect(racesImport.listOngoingEras).not.toHaveBeenCalled();
  });

  it("resolves the race's single ongoing era", async () => {
    const { service, externalSystemBootstrap, lookup, racesImport } =
      await makeService();
    racesImport.listOngoingEras.mockResolvedValue([
      { id: 11, name: 'Fifth era' },
    ]);
    const errors: ImportError[] = [];

    const era = await service.resolveEra({ roster: ROSTER, errors });

    expect(era).toBe('Fifth era');
    expect(externalSystemBootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
    ]);
    expect(lookup.lookupMap).toHaveBeenCalledWith('race', [
      { externalSystemId: TP_SYSTEM_ID, externalId: 'Orc' },
    ]);
    expect(racesImport.listOngoingEras).toHaveBeenCalledWith(50, errors);
    expect(errors).toEqual([]);
  });

  it('records one error when the race is in no ongoing era', async () => {
    const { service, racesImport } = await makeService();
    racesImport.listOngoingEras.mockResolvedValue([]);
    const errors: ImportError[] = [];

    const era = await service.resolveEra({ roster: ROSTER, errors });

    expect(era).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { team: 5, teamRaceCode: 'Orc', ongoingEras: [] },
        message:
          'Could not resolve an era for team "Da Boyz": race "Orc" has no ongoing era',
      },
    ]);
  });

  it('records one error naming every era when the race is in several ongoing eras', async () => {
    const { service, racesImport } = await makeService();
    racesImport.listOngoingEras.mockResolvedValue([
      { id: 11, name: 'Fifth era' },
      { id: 12, name: 'Dungeon Bowl era' },
    ]);
    const errors: ImportError[] = [];

    const era = await service.resolveEra({ roster: ROSTER, errors });

    expect(era).toBeUndefined();
    expect(errors).toEqual([
      {
        item: {
          team: 5,
          teamRaceCode: 'Orc',
          ongoingEras: ['Fifth era', 'Dungeon Bowl era'],
        },
        message:
          'Could not resolve an era for team "Da Boyz": race "Orc" is in several ongoing eras (Fifth era, Dungeon Bowl era); the era must be specified explicitly',
      },
    ]);
  });

  it('records one error when the race cannot be resolved', async () => {
    const { service, racesImport } = await makeService({
      raceIdsByCode: new Map(),
    });
    const errors: ImportError[] = [];

    const era = await service.resolveEra({ roster: ROSTER, errors });

    expect(era).toBeUndefined();
    expect(errors).toEqual([
      {
        item: { team: 5, teamRaceCode: 'Orc' },
        message:
          'Could not resolve an era for team "Da Boyz": could not resolve race for code "Orc"',
      },
    ]);
    expect(racesImport.listOngoingEras).not.toHaveBeenCalled();
  });

  it("records the bootstrap's error when the TP external system cannot be set up", async () => {
    const bootstrapError: ImportError = {
      item: { externalSystems: ['TP'] },
      message: 'network timeout',
    };
    const { service, lookup } = await makeService({
      bootstrapResult: { ok: false, error: bootstrapError },
    });
    const errors: ImportError[] = [];

    const era = await service.resolveEra({ roster: ROSTER, errors });

    expect(era).toBeUndefined();
    expect(errors).toEqual([bootstrapError]);
    expect(lookup.lookupMap).not.toHaveBeenCalled();
  });

  it('adds no error of its own when listing the ongoing eras fails', async () => {
    const listError: ImportError = {
      item: { race: 50, ongoingEras: 'list' },
      message: 'Failed to list ongoing eras for race 50: down',
    };
    const { service, racesImport } = await makeService();
    racesImport.listOngoingEras.mockImplementation((_raceId, errors) => {
      errors.push(listError);
      return Promise.resolve(undefined);
    });
    const errors: ImportError[] = [];

    const era = await service.resolveEra({ roster: ROSTER, errors });

    expect(era).toBeUndefined();
    expect(errors).toEqual([listError]);
  });
});
