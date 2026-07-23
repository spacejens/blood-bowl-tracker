import type { PositionsImportService } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { StarPositionUsage } from '../players/tp-players-import.service';
import { TpPositionRaceErasImportService } from './tp-position-race-eras-import.service';

function makePositionsImport(
  syncRaceEras: ReturnType<typeof vi.fn>,
): PositionsImportService {
  return { syncRaceEras } as unknown as PositionsImportService;
}

const raceIdsByTeamRaceCode = new Map<string, number>([
  ['Dwarf', 50],
  ['Human', 60],
]);
const eraIdsByName = new Map<string, number>([
  ['Third Era', 500],
  ['Fourth era', 600],
]);

describe('TpPositionRaceErasImportService', () => {
  it('syncs one star position with every distinct (race, era) pair it was fielded on', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1, 2] });
    const service = new TpPositionRaceErasImportService(
      makePositionsImport(syncRaceEras),
      new ImportResultService(),
    );
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
      { positionId: 800, teamRaceCode: 'Human', era: 'Fourth era' },
    ];

    const { result } = await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(syncRaceEras).toHaveBeenCalledTimes(1);
    expect(syncRaceEras).toHaveBeenCalledWith(
      {
        positionId: 800,
        raceEras: [
          { raceId: 50, eraId: 500 },
          { raceId: 60, eraId: 600 },
        ],
      },
      expect.any(Array),
    );
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('dedupes repeated usages of the same (race, era) pair for a position', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1] });
    const service = new TpPositionRaceErasImportService(
      makePositionsImport(syncRaceEras),
      new ImportResultService(),
    );
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
    ];

    await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 800, raceEras: [{ raceId: 50, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('makes no syncRaceEras call when there are no star position usages', async () => {
    const syncRaceEras = vi.fn();
    const service = new TpPositionRaceErasImportService(
      makePositionsImport(syncRaceEras),
      new ImportResultService(),
    );

    const { result } = await service.syncStarPositionRaceEras({
      starPositionUsages: [],
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(syncRaceEras).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('groups usages per position into separate syncRaceEras calls', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 0, raceEraIds: [1] });
    const service = new TpPositionRaceErasImportService(
      makePositionsImport(syncRaceEras),
      new ImportResultService(),
    );
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
      { positionId: 810, teamRaceCode: 'Human', era: 'Fourth era' },
    ];

    const { result } = await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(syncRaceEras).toHaveBeenCalledTimes(2);
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 800, raceEras: [{ raceId: 50, eraId: 500 }] },
      expect.any(Array),
    );
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 810, raceEras: [{ raceId: 60, eraId: 600 }] },
      expect.any(Array),
    );
    expect(result.imported).toBe(2);
  });

  it('records an ImportError and skips a usage whose race code cannot be resolved, still processing the rest', async () => {
    const syncRaceEras = vi
      .fn()
      .mockResolvedValue({ positionId: 800, raceEraIds: [1] });
    const service = new TpPositionRaceErasImportService(
      makePositionsImport(syncRaceEras),
      new ImportResultService(),
    );
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'UnknownRace', era: 'Third Era' },
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
    ];

    const { result } = await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('UnknownRace');
    expect(syncRaceEras).toHaveBeenCalledWith(
      { positionId: 800, raceEras: [{ raceId: 50, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('records an ImportError and skips a usage whose era cannot be resolved', async () => {
    const syncRaceEras = vi.fn();
    const service = new TpPositionRaceErasImportService(
      makePositionsImport(syncRaceEras),
      new ImportResultService(),
    );
    const starPositionUsages: StarPositionUsage[] = [
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Unknown Era' },
    ];

    const { result } = await service.syncStarPositionRaceEras({
      starPositionUsages,
      raceIdsByTeamRaceCode,
      eraIdsByName,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Unknown Era');
    // The only usage errored out, so no position had any resolvable pair.
    expect(syncRaceEras).not.toHaveBeenCalled();
  });
});
