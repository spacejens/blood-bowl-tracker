import { PositionsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
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
    competitions: [],
    sppAwardValues: [],
    trophies: [],
    competitionGroups: [],
  };
}

function makeContext(data: ManualDataFile): ProcessContext {
  return {
    data,
    systemIds: new Map([['Name', 2]]),
    errors: [],
  };
}

describe('PositionsProcessor', () => {
  let processor: PositionsProcessor;
  let positions: MockProxy<PositionsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    positions = mock<PositionsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsProcessor,
        { provide: PositionsImportService, useValue: positions },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(PositionsProcessor);
  });

  it('upserts the position and syncs resolved race-eras', async () => {
    positions.upsert.mockResolvedValue({
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
    const cannedExternalIds = [
      { externalSystemId: 99, externalId: 'canned:zombie' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
    // One resolveRef call per race-era pair: race first, then era.
    refResolver.resolveRef
      .mockResolvedValueOnce(40) // race
      .mockResolvedValueOnce(50); // era
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
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(positions.upsert).toHaveBeenCalledWith(
      { name: 'Zombie', isStarPlayer: false, externalIds: cannedExternalIds },
      ctx.errors,
    );
    // The processor must pair each pair's resolved race/era ids together
    // in the order they were resolved, not just pass either one through.
    expect(positions.syncRaceEras).toHaveBeenCalledWith(
      { positionId: 80, raceEras: [{ raceId: 40, eraId: 50 }] },
      ctx.errors,
    );
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: data.positions[0].raceEras[0].race,
        kind: 'race',
      }),
    );
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: data.positions[0].raceEras[0].era,
        kind: 'era',
      }),
    );
  });

  it('makes no syncRaceEras call for a position without raceEras', async () => {
    positions.upsert.mockResolvedValue({
      id: 81,
      name: 'Blitzer',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.positions = [
      {
        name: 'Blitzer',
        isStarPlayer: false,
        raceEras: [],
        externalIds: [{ system: 'Name', id: 'name:blitzer' }],
      },
    ];

    const count = await processor.process(makeContext(data));

    expect(count).toBe(1);
    expect(positions.syncRaceEras).not.toHaveBeenCalled();
    expect(refResolver.resolveRef).not.toHaveBeenCalled();
  });

  // Resolution-failure error counting is the resolver's own behaviour and is
  // covered by reference-resolver.service.spec.ts. This test instead asserts
  // the processor's own logic: an unresolved pair must still count the
  // already-successful upsert but must not call syncRaceEras.
  it('records the count but skips syncRaceEras when a race-era ref is unresolved', async () => {
    positions.upsert.mockResolvedValue({
      id: 82,
      name: 'Zombie',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([]);
    refResolver.resolveRef
      .mockResolvedValueOnce(40) // race resolves
      .mockResolvedValueOnce(undefined); // era fails
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
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(positions.syncRaceEras).not.toHaveBeenCalled();
  });

  it('does not sync or count when the position upsert fails', async () => {
    positions.upsert.mockResolvedValue(undefined);
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];

    const count = await processor.process(makeContext(data));

    expect(count).toBe(0);
    expect(positions.syncRaceEras).not.toHaveBeenCalled();
  });

  it('resolves the characteristics rules set and forwards the values', async () => {
    positions.upsert.mockResolvedValue({
      id: 1,
      name: 'Zombie',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
    positions.syncRaceEras.mockResolvedValue({
      positionId: 1,
      raceEraIds: [1],
    });
    refResolver.toExternalIds.mockReturnValue([]);
    // One resolveRef call per race-era pair: race, era, then rules set.
    refResolver.resolveRef
      .mockResolvedValueOnce(2) // race
      .mockResolvedValueOnce(3) // era
      .mockResolvedValueOnce(7); // rules set
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [
          {
            race: { system: 'Name', id: 'name:necromantic' },
            era: { system: 'Name', id: 'name:season-12' },
            characteristics: {
              rulesSet: { system: 'Name', id: 'name:bb2020' },
              move: 4,
              strength: 3,
              agility: 4,
              passing: 5,
              armour: 9,
            },
          },
        ],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];
    const ctx = makeContext(data);

    await processor.process(ctx);

    expect(positions.syncRaceEras).toHaveBeenCalledWith(
      {
        positionId: 1,
        raceEras: [
          {
            raceId: 2,
            eraId: 3,
            characteristics: {
              rulesSetId: 7,
              move: 4,
              strength: 3,
              agility: 4,
              passing: 5,
              armour: 9,
            },
          },
        ],
      },
      ctx.errors,
    );
  });

  it('sends an omitted passing on as an explicit null', async () => {
    positions.upsert.mockResolvedValue({
      id: 1,
      name: 'Zombie',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
    positions.syncRaceEras.mockResolvedValue({
      positionId: 1,
      raceEraIds: [1],
    });
    refResolver.toExternalIds.mockReturnValue([]);
    refResolver.resolveRef
      .mockResolvedValueOnce(2) // race
      .mockResolvedValueOnce(3) // era
      .mockResolvedValueOnce(7); // rules set
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [
          {
            race: { system: 'Name', id: 'name:necromantic' },
            era: { system: 'Name', id: 'name:season-12' },
            characteristics: {
              rulesSet: { system: 'Name', id: 'name:crp' },
              move: 6,
              strength: 3,
              agility: 3,
              armour: 8,
            },
          },
        ],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];
    const ctx = makeContext(data);

    await processor.process(ctx);

    const call = positions.syncRaceEras.mock.calls[0][0];
    expect(call.raceEras[0].characteristics?.passing).toBeNull();
  });

  it('skips the whole sync when the characteristics rules set does not resolve', async () => {
    positions.upsert.mockResolvedValue({
      id: 1,
      name: 'Zombie',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([]);
    refResolver.resolveRef
      .mockResolvedValueOnce(2) // race
      .mockResolvedValueOnce(3) // era
      .mockResolvedValueOnce(undefined); // rules set fails to resolve
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [
          {
            race: { system: 'Name', id: 'name:necromantic' },
            era: { system: 'Name', id: 'name:season-12' },
            characteristics: {
              rulesSet: { system: 'Name', id: 'name:missing' },
              move: 4,
              strength: 3,
              agility: 4,
              passing: 5,
              armour: 9,
            },
          },
        ],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];
    const ctx = makeContext(data);

    await processor.process(ctx);

    expect(positions.syncRaceEras).not.toHaveBeenCalled();
  });

  it('passes isStarPlayer through as undefined when the entry omits it', async () => {
    positions.upsert.mockResolvedValue({
      id: 12,
      name: 'Blitzer',
      isStarPlayer: false,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.positions = [
      {
        name: 'Blitzer',
        raceEras: [],
        externalIds: [{ system: 'Name', id: 'blitzer' }],
      },
    ];

    await processor.process(makeContext(data));

    expect(positions.upsert.mock.calls[0][0]).toEqual({
      name: 'Blitzer',
      isStarPlayer: undefined,
      externalIds: [],
    });
  });
});
