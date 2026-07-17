import type { PositionsImportService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
import { BblPositionRaceErasImportService } from './bbl-position-race-eras-import.service';

function makeEra(overrides: Partial<EraConfig> = {}): EraConfig {
  return {
    identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
    dates: { startDate: '2011-09-09', autoAssignByDate: true },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
    ...overrides,
  };
}

function makePositionsImport(
  syncRaceErasMock: ReturnType<typeof vi.fn>,
): PositionsImportService {
  return {
    syncRaceEras: syncRaceErasMock,
  } as unknown as PositionsImportService;
}

function makeEraConfig(eras: EraConfig[]): EraConfigService {
  return { getEras: () => eras } as unknown as EraConfigService;
}

describe('BblPositionRaceErasImportService', () => {
  const positionIdsByBblId = new Map<string, number>([['10-7', 100]]);
  const racesByBblId = new Map<string, { id: number; name: string }>([
    ['7', { id: 7, name: 'Orcs' }],
  ]);
  const eraIdsByName = new Map<string, number>([['Living rulebook', 500]]);

  it('includes all race_eras of a star player position regardless of usage', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: true, raceDbIds: new Set([7, 9]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([
      [7, new Set([500])],
      [9, new Set([500])],
    ]);
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [1, 2] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig([]),
    );

    const { result } = await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      new Set(),
      new Set(),
    );

    expect(syncRaceErasMock).toHaveBeenCalledWith(
      {
        positionId: 100,
        raceEras: [
          { raceId: 7, eraId: 500 },
          { raceId: 9, eraId: 500 },
        ],
      },
      expect.any(Array),
    );
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('includes a star player position in an era where the race was active but the position went unused', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: true, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set(['7:500']);
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [1] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig([]),
    );

    await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    );

    expect(syncRaceErasMock).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [{ raceId: 7, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('includes a regular position in an era where a player used it', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set(['100:500']);
    const racesActiveByEra = new Set(['7:500']);
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [1] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig([]),
    );

    await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    );

    expect(syncRaceErasMock).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [{ raceId: 7, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('excludes a regular position from an era where the race was active but the position went unused', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set(['7:500']);
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig([]),
    );

    await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    );

    expect(syncRaceErasMock).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [] },
      expect.any(Array),
    );
  });

  it('includes a regular position in an era where the race had no teams at all', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set<string>();
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [1] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig([]),
    );

    await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    );

    expect(syncRaceErasMock).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [{ raceId: 7, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('excludes an era where a config override says available:false, even though a player used it', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set(['100:500']);
    const racesActiveByEra = new Set(['7:500']);
    const eras = [
      makeEra({
        positions: [{ positionId: '10', raceId: '7', available: false }],
      }),
    ];
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig(eras),
    );

    await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    );

    expect(syncRaceErasMock).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [] },
      expect.any(Array),
    );
  });

  it('includes an era where a config override says available:true even though the race was active and the position unused', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set(['7:500']);
    const eras = [
      makeEra({
        positions: [{ positionId: '10', raceId: '7', available: true }],
      }),
    ];
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [1] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig(eras),
    );

    await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    );

    expect(syncRaceErasMock).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [{ raceId: 7, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('records an ImportError when an override positionId/raceId does not resolve', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const eras = [
      makeEra({
        positions: [{ positionId: '999', raceId: '7', available: false }],
      }),
    ];
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig(eras),
    );

    const { result } = await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      new Set(),
      new Set(),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('999');
  });

  it('records an ImportError when an override race bblId does not resolve', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const eras = [
      makeEra({
        positions: [
          { positionId: '10', raceId: 'unknown-race', available: false },
        ],
      }),
    ];
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig(eras),
    );

    const { result } = await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      new Set(),
      new Set(),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('unknown-race');
  });

  it('records an ImportError when an override containing era name does not resolve', async () => {
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const eras = [
      makeEra({
        identity: { name: 'Unknown era', rulesSets: ['Living rulebook'] },
        positions: [{ positionId: '10', raceId: '7', available: false }],
      }),
    ];
    const syncRaceErasMock = vi
      .fn()
      .mockResolvedValue({ positionId: 100, raceEraIds: [] });
    const service = new BblPositionRaceErasImportService(
      makePositionsImport(syncRaceErasMock),
      makeEraConfig(eras),
    );

    const { result } = await service.syncPositionRaceEras(
      positionRaceCandidates,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
      eraIdsByRaceId,
      new Set(),
      new Set(),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Unknown era');
  });
});
