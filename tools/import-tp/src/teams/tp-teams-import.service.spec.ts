import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  ReferenceLookupService,
  TeamsImportService,
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
import { TpTeamsImportService } from './tp-teams-import.service';

/** The numeric id the mocked bootstrap assigns to the TP external system. */
const TP_SYSTEM_ID = 1;

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertTeam: ReturnType<typeof vi.fn>;
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
  upsertTeam,
  getTpSystemName = () => 'TP',
  eraIdsByName = new Map([
    ['Fourth era', 100],
    ['Fifth era', 200],
  ]),
  getEras,
}: MakeServiceOptions): Promise<{
  service: TpTeamsImportService;
  importResults: MockProxy<ImportResultService>;
  lookup: MockProxy<ReferenceLookupService>;
}> {
  const teamsImport = mock<TeamsImportService>();
  teamsImport.upsertTeam.mockImplementation(asProviderMethod(upsertTeam));
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
      TpTeamsImportService,
      { provide: TeamsImportService, useValue: teamsImport },
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
    service: moduleRef.get(TpTeamsImportService),
    importResults,
    lookup,
  };
}

interface RosterOpts {
  id: number;
  teamName?: string;
  teamRace: string;
  raceName?: string;
  coachTpId: string;
}

function rosterEntry(era: string, opts: RosterOpts): RosterEntry {
  return {
    era,
    competition: 'comp',
    roster: {
      id: opts.id,
      teamName: opts.teamName ?? `Team ${opts.id}`,
      teamRaceCode: opts.teamRace,
      raceName: opts.raceName ?? 'Orc',
      coachTpId: opts.coachTpId,
      positions: [],
      starPositions: [],
      players: [],
    },
  };
}

function teamRecord(id: number) {
  return {
    id,
    name: 'X',
    raceId: 1,
    coachId: 1,
    eras: [],
    createdAt: new Date(),
    created: true,
  };
}

function twoSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
}

describe('TpTeamsImportService', () => {
  it('upserts a team with resolved race, coach, eras and external ids', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const bootstrap = twoSystemUpsertMock();
    const { service, importResults } = await makeService({
      bootstrap,
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toEqual([]);
    expect(upsertTeam).toHaveBeenCalledWith(
      {
        name: 'Da Boyz',
        raceId: 50,
        coachId: 900,
        eras: [100],
        externalIds: [
          { externalSystemId: 1, externalId: '5' },
          { externalSystemId: 2, externalId: 'Da Boyz' },
        ],
      },
      expect.any(Array),
    );
  });

  it('accumulates eras for one team seen under multiple eras', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
        rosterEntry('Fifth era', {
          id: 5,
          teamRace: 'Orc_BB2025',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([
          ['Orc', 50],
          ['Orc_BB2025', 50],
        ]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    expect(upsertTeam).toHaveBeenCalledTimes(1);
    expect((upsertTeam.mock.calls[0][0] as UpsertTeam).eras).toEqual([
      100, 200,
    ]);
  });

  it('keeps the first-seen name/race/coach when a roster id recurs', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
        rosterEntry('Fifth era', {
          id: 5,
          teamName: 'Renamed Boyz',
          teamRace: 'Orc_BB2025',
          coachTpId: 'guid-d',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([
          ['Orc', 50],
          ['Orc_BB2025', 60],
        ]),
        coachIdsByTpId: new Map([
          ['guid-c', 900],
          ['guid-d', 901],
        ]),
      },
    );

    expect(upsertTeam).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Da Boyz', raceId: 50, coachId: 900 }),
      expect.any(Array),
    );
  });

  it('skips and records an error when the race cannot be resolved', async () => {
    const upsertTeam = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map(),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    expect(upsertTeam).not.toHaveBeenCalled();
    const { errors } = resultArgs(importResults);
    expect(
      errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('skips and records an error when the coach cannot be resolved', async () => {
    const upsertTeam = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map(),
      },
    );

    expect(upsertTeam).not.toHaveBeenCalled();
    const { errors } = resultArgs(importResults);
    expect(
      errors.some((e) => e.message.includes('could not resolve coach')),
    ).toBe(true);
  });

  it('records an error for a roster under an unknown era but still upserts the team', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
        rosterEntry('Ghost era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    expect(upsertTeam).toHaveBeenCalledTimes(1);
    expect((upsertTeam.mock.calls[0][0] as UpsertTeam).eras).toEqual([100]);
    const { errors } = resultArgs(importResults);
    expect(errors.some((e) => e.message.includes('Ghost era'))).toBe(true);
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertTeam = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          item: { externalSystems: ['TP', 'Name'] },
          message: 'network timeout',
        },
      }),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertTeam).not.toHaveBeenCalled();
  });

  it('returns teamErasByRosterId with each team resolved eras keyed by roster id', async () => {
    const upsertTeam = vi.fn().mockResolvedValue({
      ...teamRecord(70),
      eras: [{ id: 700, eraId: 100 }],
    });
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { teamErasByRosterId } = await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    expect(teamErasByRosterId.get(5)).toEqual([{ id: 700, eraId: 100 }]);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const { service } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    expect(result).toBe(CANNED_RESULT);
  });

  it('resolves every configured era in one batched call', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const { service, lookup } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    expect(lookup.lookupMap).toHaveBeenCalledWith(
      'era',
      expect.arrayContaining([
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fourth era' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fifth era' },
      ]),
    );
  });

  it('records one error and imports nothing when the era config cannot be read', async () => {
    const upsertTeam = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
      },
    );

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TP_ERAS');
    expect(upsertTeam).not.toHaveBeenCalled();
  });
});
