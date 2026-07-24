import { PositionsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { PositionsProcessor } from './positions.processor';
import { mockReferenceResolver } from './reference-resolver-mock.test-helpers';

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
    errors: [],
  };
}

describe('PositionsProcessor', () => {
  let processor: PositionsProcessor;
  let positions: MockProxy<PositionsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    positions = mock<PositionsImportService>();
    refResolver = mockReferenceResolver();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsProcessor,
        { provide: PositionsImportService, useValue: positions },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(PositionsProcessor);
  });

  it('upserts the position, records ids, and syncs resolved race-eras', async () => {
    positions.upsertPosition.mockResolvedValue({
      id: 80,
      name: 'Zombie',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
    positions.syncRaceEras.mockResolvedValue({
      positionId: 80,
      raceEraIds: [1],
    });
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

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(positions.upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Zombie',
        isStarPlayer: false,
        externalIds: [{ externalSystemId: 2, externalId: 'name:zombie' }],
      },
      ctx.errors,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(positions.syncRaceEras).toHaveBeenCalledWith(
      { positionId: 80, raceEras: [{ raceId: 40, eraId: 50 }] },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:zombie' })).toBe(80);
  });

  it('makes no syncRaceEras call for a position without raceEras', async () => {
    positions.upsertPosition.mockResolvedValue({
      id: 81,
      name: 'Blitzer',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
    const data = emptyData();
    data.positions = [
      {
        name: 'Blitzer',
        isStarPlayer: false,
        raceEras: [],
        externalIds: [{ system: 'Name', id: 'name:blitzer' }],
      },
    ];

    const count = await processor.process(
      makeContext(data, new ExternalIdMap()),
    );

    expect(count).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(positions.syncRaceEras).not.toHaveBeenCalled();
  });

  it('records the count but skips syncRaceEras when a race-era ref is unresolved', async () => {
    positions.upsertPosition.mockResolvedValue({
      id: 82,
      name: 'Zombie',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
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

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(positions.syncRaceEras).not.toHaveBeenCalled();
    expect(ctx.errors).toHaveLength(1);
  });

  it('does not sync or count when the position upsert fails', async () => {
    positions.upsertPosition.mockResolvedValue(undefined);
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];

    const count = await processor.process(
      makeContext(data, new ExternalIdMap()),
    );

    expect(count).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(positions.syncRaceEras).not.toHaveBeenCalled();
  });
});
