import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemsImportService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile, TpSourceReader } from '../source/tp-source-reader';
import { TpPositionsImportService } from './tp-positions-import.service';

interface MakeServiceOptions {
  files: () => AsyncIterable<TpSourceFile>;
  upsertExternalSystem: ReturnType<typeof vi.fn>;
  upsertPosition: ReturnType<typeof vi.fn>;
  syncRaceEras: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  files,
  upsertExternalSystem,
  upsertPosition,
  syncRaceEras,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpPositionsImportService(
    { files } as unknown as TpSourceReader,
    new RosterParserService(),
    { upsertPosition, syncRaceEras } as unknown as PositionsImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

function makeFiles(entries: TpSourceFile[]): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
  };
}

interface RosterOpts {
  teamRace: string;
  raceName: string;
  positions: { tpPositionId: number; name: string }[];
  id?: number;
}

function rosterFile(era: string, opts: RosterOpts): TpSourceFile {
  const { teamRace, raceName, positions, id = 1 } = opts;
  return {
    era,
    competition: 'comp',
    type: 'rosters',
    filename: `rosters_${id}.json`,
    content: {
      id,
      teamName: `Team ${id}`,
      teamRace,
      player: { applicationUserId: 'coach-1' },
      rosterMaster: {
        name: raceName,
        starPlayersMasters: [],
        lineUpMasters: positions.map((p) => ({
          id: p.tpPositionId,
          position: p.name,
        })),
      },
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
  return vi.fn().mockResolvedValueOnce(1);
}

describe('TpPositionsImportService', () => {
  it('dedupes the same position name under the same code into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
        rosterFile('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 2,
        }),
      ]),
      upsertExternalSystem: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result } = await service.importPositions(
      new Map([['Dwarf', 50]]),
      new Map([['Fourth era', 100]]),
    );

    expect(result.imported).toBe(1);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Dwarf Blocker Lineman',
        isStarPlayer: false,
        externalIds: [{ externalSystemId: 1, externalId: '280' }],
      },
      expect.any(Array),
    );
  });

  it('merges the same position name across rule-set codes of one race into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1, 2] });
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 281, name: 'Dwarf Runner' }],
          id: 1,
        }),
        rosterFile('Fifth era', {
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 954, name: 'Dwarf Runner' }],
          id: 2,
        }),
      ]),
      upsertExternalSystem: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      new Map([
        ['Dwarf', 50],
        ['Dwarf_BB2025', 50],
      ]),
      new Map([
        ['Fourth era', 100],
        ['Fifth era', 200],
      ]),
    );

    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(
      (upsertPosition.mock.calls[0][0] as UpsertPosition).externalIds,
    ).toEqual([
      { externalSystemId: 1, externalId: '281' },
      { externalSystemId: 1, externalId: '954' },
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
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
        rosterFile('Fifth era', {
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 952, name: 'Dwarf Lineman' }],
          id: 2,
        }),
      ]),
      upsertExternalSystem: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result } = await service.importPositions(
      new Map([
        ['Dwarf', 50],
        ['Dwarf_BB2025', 50],
      ]),
      new Map([
        ['Fourth era', 100],
        ['Fifth era', 200],
      ]),
    );

    expect(result.imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledTimes(2);
  });

  it('skips a roster and records an error when its race cannot be resolved', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ]),
      upsertExternalSystem: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result } = await service.importPositions(
      new Map(),
      new Map([['Fourth era', 100]]),
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
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ]),
      upsertExternalSystem: vi
        .fn()
        .mockRejectedValue(new Error('network timeout')),
      upsertPosition,
      syncRaceEras,
    });

    const { result } = await service.importPositions(
      new Map([['Dwarf', 50]]),
      new Map([['Fourth era', 100]]),
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
    const service = makeService({
      files: makeFiles([
        rosterFile('Unknown era', {
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
          positions: [{ tpPositionId: 280, name: 'Dwarf Blocker Lineman' }],
          id: 1,
        }),
      ]),
      upsertExternalSystem: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result } = await service.importPositions(
      new Map([['Dwarf', 50]]),
      new Map([['Fourth era', 100]]),
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
});
