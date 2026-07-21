import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemBootstrapService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpPositionsImportService } from './tp-positions-import.service';

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertPosition: ReturnType<typeof vi.fn>;
  syncRaceEras: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  bootstrap,
  upsertPosition,
  syncRaceEras,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpPositionsImportService(
    { upsertPosition, syncRaceEras } as unknown as PositionsImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

interface RosterOpts {
  teamRace: string;
  raceName: string;
  positions: { tpPositionId: number; name: string }[];
  id?: number;
}

function rosterEntry(era: string, opts: RosterOpts): RosterEntry {
  const { teamRace, raceName, positions, id = 1 } = opts;
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
      starPositions: [],
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
  return vi.fn().mockResolvedValue({ ok: true, ids: [1] });
}

describe('TpPositionsImportService', () => {
  it('dedupes the same position name under the same code into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const bootstrap = oneSystemUpsertMock();
    const service = makeService({
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
      new Map([['Dwarf', 50]]),
      new Map([['Fourth era', 100]]),
    );

    expect(bootstrap).toHaveBeenCalledWith(['TP']);
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
    expect(positionIdsByTpPositionId.get(280)).toBe(70);
  });

  it('merges the same position name across rule-set codes of one race into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1, 2] });
    const service = makeService({
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
    expect(positionIdsByTpPositionId.get(281)).toBe(70);
    expect(positionIdsByTpPositionId.get(954)).toBe(70);
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
