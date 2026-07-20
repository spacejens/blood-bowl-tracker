import type {
  ImportError,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { PositionsProcessor } from './positions.processor';

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    coaches: [],
    teams: [],
  };
}

function makeContext(
  data: ManualDataFile,
  idMap: ExternalIdMap,
): ProcessContext {
  return {
    data,
    systemIds: new Map([['Name', 2]]),
    idMap,
    errors: [] as ImportError[],
  };
}

function makeProcessor(mocks: {
  upsertPosition: ReturnType<typeof vi.fn>;
  syncRaceEras: ReturnType<typeof vi.fn>;
}) {
  return new PositionsProcessor(mocks as unknown as PositionsImportService);
}

describe('PositionsProcessor', () => {
  it('upserts the position, records ids, and syncs resolved race-eras', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 80 });
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 80, raceEraIds: [1] });
    const idMap = new ExternalIdMap();
    idMap.add([{ system: 'Name', id: 'name:necromantic' }], 40);
    idMap.add([{ system: 'Name', id: 'name:season-12' }], 50);
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [
          {
            race: { system: 'Name', id: 'name:necromantic' },
            era: { system: 'Name', id: 'name:season-12' },
          },
        ],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];
    const ctx = makeContext(data, idMap);

    const count = await makeProcessor({ upsertPosition, syncRaceEras }).process(
      ctx,
    );

    expect(count).toBe(1);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Zombie',
        isStarPlayer: false,
        externalIds: [{ externalSystemId: 2, externalId: 'name:zombie' }],
      },
      ctx.errors,
    );
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 80, raceEras: [{ raceId: 40, eraId: 50 }] },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:zombie' })).toBe(80);
  });

  it('makes no syncRaceEras call for a position without raceEras', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 81 });
    const syncRaceEras = vi.fn();
    const data = emptyData();
    data.positions = [
      {
        name: 'Blitzer',
        isStarPlayer: false,
        raceEras: [],
        externalIds: [{ system: 'Name', id: 'name:blitzer' }],
      },
    ];

    const count = await makeProcessor({ upsertPosition, syncRaceEras }).process(
      makeContext(data, new ExternalIdMap()),
    );

    expect(count).toBe(1);
    expect(syncRaceEras).not.toHaveBeenCalled();
  });

  it('records the count but skips syncRaceEras when a race-era ref is unresolved', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 82 });
    const syncRaceEras = vi.fn();
    const idMap = new ExternalIdMap();
    idMap.add([{ system: 'Name', id: 'name:necromantic' }], 40);
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [
          {
            race: { system: 'Name', id: 'name:necromantic' },
            era: { system: 'Name', id: 'name:missing-era' },
          },
        ],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];
    const ctx = makeContext(data, idMap);

    const count = await makeProcessor({ upsertPosition, syncRaceEras }).process(
      ctx,
    );

    expect(count).toBe(1);
    expect(syncRaceEras).not.toHaveBeenCalled();
    expect(ctx.errors).toHaveLength(1);
  });

  it('does not sync or count when the position upsert fails', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(undefined);
    const syncRaceEras = vi.fn();
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];

    const count = await makeProcessor({ upsertPosition, syncRaceEras }).process(
      makeContext(data, new ExternalIdMap()),
    );

    expect(count).toBe(0);
    expect(syncRaceEras).not.toHaveBeenCalled();
  });
});
