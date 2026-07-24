import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
  mockNameExternalIdService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { RosterCollectionService } from '../source/roster-collection.service';
import { TpRacesImportService } from './tp-races-import.service';

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertRace: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

async function makeService({
  bootstrap,
  upsertRace,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions): Promise<TpRacesImportService> {
  const racesImport = mock<RacesImportService>();
  racesImport.upsertRace.mockImplementation(asProviderMethod(upsertRace));
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
    ],
  }).compile();
  return moduleRef.get(TpRacesImportService);
}

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
      positions: opts.positions ?? [],
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
    const service = await makeService({
      bootstrap,
      upsertRace,
    });

    const { result, raceIdsByTeamRaceCode } = await service.importRaces(
      [
        rosterEntry('Fourth era', {
          id: 1,
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
        }),
      ],
      new Map([['Fourth era', 100]]),
    );

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
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
    expect(raceIdsByTeamRaceCode.get('Dwarf_BB2025')).toBe(50);
  });

  it('returns raceNamesById mapping each upserted race DB id to its display name', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(42));
    const service = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    const { raceNamesById } = await service.importRaces(
      [
        rosterEntry('Fourth era', {
          id: 1,
          teamRace: 'Necromantic_BB2025',
          raceName: 'Necromantic Horror',
        }),
      ],
      new Map([['Fourth era', 100]]),
    );

    expect(raceNamesById.get(42)).toBe('Necromantic Horror');
  });

  it('merges multiple codes for one race name into a single upsert call', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    const { raceIdsByTeamRaceCode } = await service.importRaces(
      [
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
      ],
      new Map([
        ['Fourth era', 100],
        ['Fifth era', 200],
      ]),
    );

    expect(upsertRace).toHaveBeenCalledTimes(1);
    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.name).toBe('Dwarf');
    expect(data.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Dwarf' },
      { externalSystemId: 1, externalId: 'Dwarf_BB2025' },
      { externalSystemId: 2, externalId: 'Dwarf' },
    ]);
    expect(data.eras).toEqual([100, 200]);
    expect(raceIdsByTeamRaceCode.get('Dwarf')).toBe(50);
    expect(raceIdsByTeamRaceCode.get('Dwarf_BB2025')).toBe(50);
  });

  it('accumulates eras when one code appears under multiple eras', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces(
      [
        rosterEntry('Fourth era', { id: 1, teamRace: 'Orc', raceName: 'Orc' }),
        rosterEntry('Fifth era', { id: 2, teamRace: 'Orc', raceName: 'Orc' }),
      ],
      new Map([
        ['Fourth era', 100],
        ['Fifth era', 200],
      ]),
    );

    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Orc' },
      { externalSystemId: 2, externalId: 'Orc' },
    ]);
    expect(data.eras).toEqual([100, 200]);
  });

  it('records an error for a roster under an unknown era but still upserts the race', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = await makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    const { result } = await service.importRaces(
      [rosterEntry('Ghost era', { id: 1, teamRace: 'Orc', raceName: 'Orc' })],
      new Map([['Fourth era', 100]]),
    );

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Ghost era'))).toBe(
      true,
    );
    expect((upsertRace.mock.calls[0][0] as UpsertRace).eras).toEqual([]);
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertRace = vi.fn();
    const service = await makeService({
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          item: { externalSystems: ['TP', 'Name'] },
          message: 'network timeout',
        },
      }),
      upsertRace,
    });

    const { result } = await service.importRaces(
      [rosterEntry('Fourth era', { id: 1, teamRace: 'Orc', raceName: 'Orc' })],
      new Map([['Fourth era', 100]]),
    );

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertRace).not.toHaveBeenCalled();
  });
});
