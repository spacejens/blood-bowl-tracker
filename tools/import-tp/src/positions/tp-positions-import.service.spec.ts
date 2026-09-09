import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import { describe, expect, it, vi } from 'vitest';

import {
  CANNED_RESULT,
  makeService,
  officialPosition,
  officialTeamsEntry,
  oneSystemUpsertMock,
  positionRecord,
  resultArgs,
  TP_SYSTEM_ID,
} from './tp-positions-import.test-helpers';

describe('TpPositionsImportService', () => {
  it('groups by race id and position name, upserting one position per group', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Blocker Lineman',
              tpPositionId: 280,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(resultArgs(importResults).imported).toBe(1);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
  });

  it('merges the same position name across rules-set variants of one race into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1, 2] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({ name: 'Dwarf Runner', tpPositionId: 281 }),
          ],
        }),
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2025',
          positions: [
            officialPosition({ name: 'Dwarf Runner', tpPositionId: 954 }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(
      (upsertPosition.mock.calls[0][0] as UpsertPosition).externalIds,
    ).toEqual(
      expect.arrayContaining([
        { externalSystemId: 1, externalId: '281' },
        { externalSystemId: 1, externalId: '954' },
      ]),
    );
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

  it('keeps differently-named positions as two rows', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Blocker Lineman',
              tpPositionId: 280,
            }),
          ],
        }),
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2025',
          positions: [
            officialPosition({ name: 'Dwarf Lineman', tpPositionId: 952 }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(resultArgs(importResults).imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledTimes(2);
  });

  it('upserts a regular position with isStarPlayer false and a race-scoped Name external id', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, nameExternalId } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
      raceIdsByCode: new Map([['Amazon', 50]]),
    });
    nameExternalId.forPosition.mockReturnValueOnce(
      'Amazon: Eagle Warrior Linewoman',
    );

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Amazon',
          teamRaceCode: 'Amazon',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Eagle Warrior Linewoman',
              tpPositionId: 100,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Amazon']]) },
    );

    expect(nameExternalId.forPosition).toHaveBeenCalledWith(
      'Amazon',
      'Eagle Warrior Linewoman',
    );
    expect(upsertPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        isStarPlayer: false,
        externalIds: expect.arrayContaining([
          {
            externalSystemId: 2,
            externalId: 'Amazon: Eagle Warrior Linewoman',
          },
        ]) as unknown,
      }),
      expect.any(Array),
    );
  });

  it('upserts a star position with isStarPlayer true and a bare-name Name external id', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Roxanna Darknail',
              isStarPlayer: true,
              tpPositionId: 5002,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(upsertPosition).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Roxanna Darknail',
        isStarPlayer: true,
        externalIds: expect.arrayContaining([
          { externalSystemId: 2, externalId: 'Roxanna Darknail' },
        ]) as unknown,
      }),
      expect.any(Array),
    );
  });

  it('registers the official list TP position id as a TP external id, so roster players stay resolvable', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({ name: 'Dwarf Runner', tpPositionId: 101 }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    const data = upsertPosition.mock.calls[0][0] as UpsertPosition;
    expect(data.externalIds).toContainEqual({
      externalSystemId: TP_SYSTEM_ID,
      externalId: '101',
    });
  });

  it('omits the TP position id external id when the official list carries none', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [officialPosition({ name: 'Dwarf Runner' })],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    const data = upsertPosition.mock.calls[0][0] as UpsertPosition;
    expect(
      data.externalIds.some((e) => e.externalSystemId === TP_SYSTEM_ID),
    ).toBe(false);
  });

  it('syncs race eras for a regular position across every era declaring its rules sets', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({ name: 'Dwarf Runner', tpPositionId: 101 }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 70, raceEras: [{ raceId: 50, eraId: 100 }] },
      expect.any(Array),
    );
  });

  it('syncs race eras for a star position too, so star availability comes from the official list', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(800));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Roxanna Darknail',
              isStarPlayer: true,
              tpPositionId: 5002,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 800, raceEras: [{ raceId: 50, eraId: 100 }] },
      expect.any(Array),
    );
  });

  it('collects the upserted star position ids', async () => {
    const upsertPosition = vi
      .fn()
      .mockResolvedValueOnce(positionRecord(70))
      .mockResolvedValueOnce(positionRecord(800));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 0, raceEraIds: [] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { starPositionIds } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({ name: 'Dwarf Runner', tpPositionId: 101 }),
            officialPosition({
              name: 'Roxanna Darknail',
              isStarPlayer: true,
              tpPositionId: 5002,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(starPositionIds).toEqual(new Set([800]));
  });

  it('records an error and skips a position whose race code cannot be resolved', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
      raceIdsByCode: new Map(),
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Blocker Lineman',
              tpPositionId: 280,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map() },
    );

    expect(upsertPosition).not.toHaveBeenCalled();
    const { errors } = resultArgs(importResults);
    expect(
      errors.some((e) => e.message.includes('could not resolve its race')),
    ).toBe(true);
  });

  it('records an error and still upserts when the race name is missing from raceNamesById', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({ name: 'Dwarf Runner', tpPositionId: 101 }),
          ],
        }),
      ],
      // raceNamesById intentionally missing the group's raceId
      { raceNamesById: new Map() },
    );

    expect(resultArgs(importResults).errors.length).toBeGreaterThan(0);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    const data = upsertPosition.mock.calls[0][0] as UpsertPosition;
    expect(data.externalIds.some((e) => e.externalSystemId === 2)).toBe(false);
  });

  it('returns a failed result and no upserts when the external system bootstrap fails', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService({
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

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Blocker Lineman',
              tpPositionId: 280,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ externalSystems: ['TP'] });
    expect(upsertPosition).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { result } = await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Blocker Lineman',
              tpPositionId: 280,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(result).toBe(CANNED_RESULT);
  });

  it('records one error and imports nothing when the era config cannot be read', async () => {
    const upsertPosition = vi.fn();
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Blocker Lineman',
              tpPositionId: 280,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TP_ERAS');
    expect(upsertPosition).not.toHaveBeenCalled();
  });

  it('records no characteristics and no star id for a position whose upsert failed', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(undefined);
    const syncRaceEras = vi.fn();
    const { service, importResults } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    const { starPositionIds, characteristicsByPositionId } =
      await service.importPositions(
        [
          officialTeamsEntry({
            raceName: 'Dwarf',
            teamRaceCode: 'Dwarf',
            rulesSet: 'BB2020',
            positions: [
              officialPosition({
                name: 'Roxanna Darknail',
                isStarPlayer: true,
                tpPositionId: 5002,
              }),
            ],
          }),
        ],
        { raceNamesById: new Map([[50, 'Dwarf']]) },
      );

    expect(resultArgs(importResults).imported).toBe(0);
    expect(starPositionIds.size).toBe(0);
    expect(characteristicsByPositionId.size).toBe(0);
    expect(syncRaceEras).not.toHaveBeenCalled();
  });

  it('resolves every configured era in one batched call', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, lookup } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Blocker Lineman',
              tpPositionId: 280,
            }),
          ],
        }),
      ],
      { raceNamesById: new Map([[50, 'Dwarf']]) },
    );

    expect(lookup.lookupMap).toHaveBeenCalledWith(
      'era',
      expect.arrayContaining([
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fourth era' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fifth era' },
      ]),
    );
  });

  it('resolves every distinct official-list race code in one batched call', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(positionRecord(70));
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 70, raceEraIds: [1] });
    const { service, lookup } = await makeService({
      bootstrap: oneSystemUpsertMock(),
      upsertPosition,
      syncRaceEras,
    });

    await service.importPositions(
      [
        officialTeamsEntry({
          raceName: 'Dwarf',
          teamRaceCode: 'Dwarf',
          rulesSet: 'BB2020',
          positions: [
            officialPosition({
              name: 'Dwarf Blocker Lineman',
              tpPositionId: 280,
            }),
          ],
        }),
        officialTeamsEntry({
          raceName: 'Human',
          teamRaceCode: 'Human',
          rulesSet: 'BB2025',
          positions: [
            officialPosition({ name: 'Human Lineman', tpPositionId: 952 }),
          ],
        }),
      ],
      {
        raceNamesById: new Map([
          [50, 'Dwarf'],
          [60, 'Human'],
        ]),
      },
    );

    expect(lookup.lookupMap).toHaveBeenCalledWith(
      'race',
      expect.arrayContaining([
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Dwarf' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Human' },
      ]),
    );
  });
});
