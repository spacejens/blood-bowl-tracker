import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PositionsImportService,
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
import { TpPositionsImportService } from './tp-positions-import.service';

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertPosition: ReturnType<typeof vi.fn>;
  syncRaceEras: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

async function makeService({
  bootstrap,
  upsertPosition,
  syncRaceEras,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions): Promise<TpPositionsImportService> {
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
    ],
  }).compile();
  return moduleRef.get(TpPositionsImportService);
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
    const service = await makeService({
      bootstrap,
      upsertPosition,
      syncRaceEras,
    });

    const { result, positionIdsByTpPositionId } = await service.importPositions(
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
      {
        raceIdsByTeamRaceCode: new Map([['Dwarf', 50]]),
        eraIdsByName: new Map([['Fourth era', 100]]),
        raceNamesById: new Map([[50, 'Dwarf']]),
      },
    );

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(result.imported).toBe(1);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Dwarf Blocker Lineman',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '280' },
          { externalSystemId: 2, externalId: 'Dwarf: Dwarf Blocker Lineman' },
        ],
      },
      expect.any(Array),
    );
    expect(positionIdsByTpPositionId.get(280)).toBe(70);
  });

  it('merges the same position name across rule-set codes of one race into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1, 2] });
    const service = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { positionIdsByTpPositionId } = await service.importPositions(
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
      {
        raceIdsByTeamRaceCode: new Map([
          ['Dwarf', 50],
          ['Dwarf_BB2025', 50],
        ]),
        eraIdsByName: new Map([
          ['Fourth era', 100],
          ['Fifth era', 200],
        ]),
        raceNamesById: new Map([[50, 'Dwarf']]),
      },
    );

    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(positionIdsByTpPositionId.get(281)).toBe(70);
    expect(positionIdsByTpPositionId.get(954)).toBe(70);
    expect(
      (upsertPosition.mock.calls[0][0] as UpsertPosition).externalIds,
    ).toEqual([
      { externalSystemId: 1, externalId: '281' },
      { externalSystemId: 1, externalId: '954' },
      { externalSystemId: 2, externalId: 'Dwarf: Dwarf Runner' },
    ]);
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
    const service = await makeService({
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
        rosterEntry('Fifth era', {
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 952, name: 'Dwarf Lineman' }],
          id: 2,
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([
          ['Dwarf', 50],
          ['Dwarf_BB2025', 50],
        ]),
        eraIdsByName: new Map([
          ['Fourth era', 100],
          ['Fifth era', 200],
        ]),
        raceNamesById: new Map([[50, 'Dwarf']]),
      },
    );

    expect(result.imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledTimes(2);
  });

  it('skips a roster and records an error when its race cannot be resolved', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const service = await makeService({
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
      {
        raceIdsByTeamRaceCode: new Map(),
        eraIdsByName: new Map([['Fourth era', 100]]),
        raceNamesById: new Map(),
      },
    );

    expect(upsertPosition).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const service = await makeService({
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

    const { result } = await service.importPositions(
      [
        rosterEntry('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Dwarf', 50]]),
        eraIdsByName: new Map([['Fourth era', 100]]),
        raceNamesById: new Map([[50, 'Dwarf']]),
      },
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP'] });
    expect(upsertPosition).not.toHaveBeenCalled();
  });

  it('records an unknown-era error but still imports the position when era cannot be resolved', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [] });
    const service = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result } = await service.importPositions(
      [
        rosterEntry('Unknown era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Dwarf', 50]]),
        eraIdsByName: new Map([['Fourth era', 100]]),
        raceNamesById: new Map([[50, 'Dwarf']]),
      },
    );

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.toLowerCase().includes('era')),
    ).toBe(true);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 70, raceEras: [] },
      expect.any(Array),
    );
  });

  it('imports a star position grouped by name (not race) with a bare-name external id and no syncRaceEras', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi.fn();
    const service = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result, positionIdsByTpPositionId, starPositionIds } =
      await service.importPositions(
        [
          rosterEntry('Dwarf', {
            teamRace: 'Dwarf',
            raceName: 'Dwarf',
            positions: [],
            starPositions: [{ tpPositionId: 5002, name: "Morg 'n' Thorg" }],
            id: 1,
          }),
          rosterEntry('Human', {
            teamRace: 'Human',
            raceName: 'Human',
            positions: [],
            starPositions: [{ tpPositionId: 5002, name: "Morg 'n' Thorg" }],
            id: 2,
          }),
        ],
        {
          raceIdsByTeamRaceCode: new Map([
            ['Dwarf', 50],
            ['Human', 60],
          ]),
          eraIdsByName: new Map([['Dwarf', 100]]),
          raceNamesById: new Map([
            [50, 'Dwarf'],
            [60, 'Human'],
          ]),
        },
      );

    expect(result.imported).toBe(1);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: "Morg 'n' Thorg",
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 1, externalId: "Morg 'n' Thorg" },
          { externalSystemId: 2, externalId: "Morg 'n' Thorg" },
        ],
      },
      expect.any(Array),
    );
    expect(positionIdsByTpPositionId.get(5002)).toBe(800);
    expect(syncRaceEras).not.toHaveBeenCalled();
    expect(starPositionIds).toEqual(new Set([800]));
  });

  it('returns the DB ids of upserted star positions in starPositionIds', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi.fn();
    const service = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { starPositionIds } = await service.importPositions(
      [
        rosterEntry('Dwarf', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [],
          starPositions: [{ tpPositionId: 5002, name: "Morg 'n' Thorg" }],
          id: 1,
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Dwarf', 50]]),
        eraIdsByName: new Map([['Dwarf', 100]]),
        raceNamesById: new Map([[50, 'Dwarf']]),
      },
    );

    expect(starPositionIds).toEqual(new Set([800]));
  });

  it('records a non-fatal error and does not overwrite when a star id collides with a regular position id', async () => {
    const upsertPosition = vi
      .fn()
      .mockResolvedValueOnce(positionRecord(70)) // regular position upsert
      .mockResolvedValueOnce(positionRecord(800)); // star position upsert
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const service = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result, positionIdsByTpPositionId } = await service.importPositions(
      [
        rosterEntry('Dwarf', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          starPositions: [{ tpPositionId: 280, name: 'Colliding Star' }],
          id: 1,
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Dwarf', 50]]),
        eraIdsByName: new Map([['Dwarf', 100]]),
        raceNamesById: new Map([[50, 'Dwarf']]),
      },
    );

    // The regular position keeps id 280 -> 70; the star does NOT overwrite it.
    expect(positionIdsByTpPositionId.get(280)).toBe(70);
    expect(
      result.errors.some((e) => e.message.toLowerCase().includes('collision')),
    ).toBe(true);
  });

  it('attaches a Name external id "raceName: positionName" to regular positions', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const service = await makeService({
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
    const raceIdsByTeamRaceCode = new Map([['HU-1', 7]]);
    const eraIdsByName = new Map([['Fourth era', 100]]);
    const raceNamesById = new Map([[7, 'Human']]);

    await service.importPositions(rosters, {
      raceIdsByTeamRaceCode,
      eraIdsByName,
      raceNamesById,
    });
    const data = upsertPosition.mock.calls[0][0] as UpsertPosition;
    expect(data.externalIds).toContainEqual({
      externalSystemId: 2, // Name system id
      externalId: 'Human: Lineman',
    });
  });

  it('tags star positions under the Name system with a bare name', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi.fn();
    const service = await makeService({
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
    const raceIdsByTeamRaceCode = new Map([['HU-1', 7]]);
    const eraIdsByName = new Map([['Fourth era', 100]]);
    const raceNamesById = new Map([[7, 'Human']]);

    await service.importPositions(rostersWithStar, {
      raceIdsByTeamRaceCode,
      eraIdsByName,
      raceNamesById,
    });
    const starData = upsertPosition.mock.calls
      .map((c) => c[0] as UpsertPosition)
      .find((d) => d.isStarPlayer);
    expect(starData?.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Griff Oberwald' },
      { externalSystemId: 2, externalId: 'Griff Oberwald' },
    ]);
  });

  it('records an error and omits the Name id when the race name cannot be resolved', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const service = await makeService({
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
    const raceIdsByTeamRaceCode = new Map([['HU-1', 7]]);
    const eraIdsByName = new Map([['Fourth era', 100]]);

    // raceNamesById intentionally missing the group's raceId
    const outcome = await service.importPositions(rosters, {
      raceIdsByTeamRaceCode,
      eraIdsByName,
      raceNamesById: new Map(),
    });
    expect(outcome.result.errors.length).toBeGreaterThan(0);
    const data = upsertPosition.mock.calls[0][0] as UpsertPosition;
    expect(data.externalIds.some((e) => e.externalSystemId === 2)).toBe(false); // no Name id attached; TP-system id(s) still present
  });
});
