import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { type EraConfig, EraConfigService } from '../eras/era-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblPositionRaceErasImportService } from './bbl-position-race-eras-import.service';

function makeEra(overrides: Partial<EraConfig> = {}): EraConfig {
  return {
    identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
    dates: { startDate: '2011-09-09', autoAssignByDate: true },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
    ...overrides,
  };
}

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

/** The numeric id the mocked bootstrap assigns to the BBL external system. */
const BBL_SYSTEM_ID = 1;

/** The default era name -> DB id resolution the mocked lookup answers with. */
const eraIdsByName = new Map<string, number>([['Living rulebook', 500]]);

/** The default position `typId-raceBblId` -> DB id resolution the mocked lookup answers with. */
const positionIdsByExternalId = new Map<string, number>([['10-7', 100]]);

/**
 * Configures `lookup.lookupMap` to resolve any ref whose external id appears
 * in the map registered for that call's `kind`, keyed via the mocked
 * (deterministic) `keyOf`. Mirrors what ReferenceLookupService itself does,
 * without reimplementing its resolution algorithm (each kind's map is
 * supplied by the caller, not derived here).
 */
function mockLookup(
  lookup: MockProxy<ReferenceLookupService>,
  idsByKind: { era: Map<string, number>; position: Map<string, number> },
): void {
  lookup.lookupMap.mockImplementation((kind, refs) => {
    const idsByExternalId =
      kind === 'era'
        ? idsByKind.era
        : kind === 'position'
          ? idsByKind.position
          : new Map<string, number>();
    return Promise.resolve(
      new Map(
        refs
          .filter((ref) => idsByExternalId.has(ref.externalId))
          .map((ref) => [
            lookup.keyOf(ref),
            idsByExternalId.get(ref.externalId) as number,
          ]),
      ),
    );
  });
}

interface Mocks {
  positionsImport: MockProxy<PositionsImportService>;
  eraConfig: MockProxy<EraConfigService>;
  importResults: MockProxy<ImportResultService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result returns a canned value
 * (see CANNED_RESULT above); tests assert what this service passes to it,
 * not what it computes. `idsByName` seeds the mocked lookup's era resolution
 * (defaulting to `eraIdsByName`); a test wanting different resolution results
 * passes its own map.
 */
async function makeService(
  eras: EraConfig[],
  idsByName: Map<string, number> = eraIdsByName,
): Promise<{ service: BblPositionRaceErasImportService; mocks: Mocks }> {
  const positionsImport = mock<PositionsImportService>();

  const eraConfig = mock<EraConfigService>();
  eraConfig.getEras.mockReturnValue(eras);

  const importResults = mock<ImportResultService>();
  // `error` is a pure identity field copy with no branching or formatting, so
  // there is no algorithm here that can drift out of sync with the real
  // ImportResultService — exempt from the canned-response rule.
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [BBL_SYSTEM_ID] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const lookup = mock<ReferenceLookupService>();
  // `keyOf` is a pure, deterministic key derivation with no branching that
  // could drift from ReferenceLookupService's own real implementation --
  // exempt from the canned-response rule, same as the other passthroughs.
  lookup.keyOf.mockImplementation(
    (ref) => `${ref.externalSystemId}\t${ref.externalId}`,
  );
  mockLookup(lookup, { era: idsByName, position: positionIdsByExternalId });

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblPositionRaceErasImportService,
      { provide: PositionsImportService, useValue: positionsImport },
      { provide: EraConfigService, useValue: eraConfig },
      { provide: ImportResultService, useValue: importResults },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblPositionRaceErasImportService),
    mocks: { positionsImport, eraConfig, importResults, bootstrap, lookup },
  };
}

describe('BblPositionRaceErasImportService', () => {
  const racesByBblId = new Map<string, { id: number; name: string }>([
    ['7', { id: 7, name: 'Orcs' }],
  ]);

  it('resolves configured eras and position overrides through the api once for the whole run', async () => {
    const { service, mocks } = await makeService([makeEra()]);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: true, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      racesActiveByEra: new Set(),
    });

    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('era', [
      { externalSystemId: BBL_SYSTEM_ID, externalId: 'Living rulebook' },
    ]);
    // makeEra() carries no `positions` overrides, so the batched call still
    // happens (one round trip per run, regardless of whether it finds
    // anything to resolve) but with an empty ref list.
    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('position', []);
    expect(mocks.lookup.lookupMap).toHaveBeenCalledTimes(2);
  });

  it('resolves position overrides by their typId-raceBblId external id', async () => {
    const eras = [
      makeEra({
        positions: [{ positionId: '10', raceId: '7', available: false }],
      }),
    ];
    const { service, mocks } = await makeService(eras);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      racesActiveByEra: new Set(),
    });

    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith(
      'position',
      expect.arrayContaining([
        { externalSystemId: BBL_SYSTEM_ID, externalId: '10-7' },
      ]),
    );
  });

  it('includes all race_eras of a star player position regardless of usage', async () => {
    const { service, mocks } = await makeService([]);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: true, raceDbIds: new Set([7, 9]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([
      [7, new Set([500])],
      [9, new Set([500])],
    ]);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [1, 2],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      racesActiveByEra: new Set(),
    });

    expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
      {
        positionId: 100,
        raceEras: [
          { raceId: 7, eraId: 500 },
          { raceId: 9, eraId: 500 },
        ],
      },
      expect.any(Array),
    );
    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(0);
  });

  it('includes a star player position in an era where the race was active but the position went unused', async () => {
    const { service, mocks } = await makeService([]);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: true, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set(['7:500']);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [1],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    });

    expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [{ raceId: 7, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('includes a regular position in an era where a player used it', async () => {
    const { service, mocks } = await makeService([]);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set(['100:500']);
    const racesActiveByEra = new Set(['7:500']);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [1],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    });

    expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [{ raceId: 7, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('excludes a regular position from an era where the race was active but the position went unused', async () => {
    const { service, mocks } = await makeService([]);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set(['7:500']);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    });

    expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [] },
      expect.any(Array),
    );
  });

  it('includes a regular position in an era where the race had no teams at all', async () => {
    const { service, mocks } = await makeService([]);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set<string>();
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [1],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    });

    expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [{ raceId: 7, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('excludes an era where a config override says available:false, even though a player used it', async () => {
    const eras = [
      makeEra({
        positions: [{ positionId: '10', raceId: '7', available: false }],
      }),
    ];
    const { service, mocks } = await makeService(eras);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set(['100:500']);
    const racesActiveByEra = new Set(['7:500']);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    });

    expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [] },
      expect.any(Array),
    );
  });

  it('includes an era where a config override says available:true even though the race was active and the position unused', async () => {
    const eras = [
      makeEra({
        positions: [{ positionId: '10', raceId: '7', available: true }],
      }),
    ];
    const { service, mocks } = await makeService(eras);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set(['7:500']);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [1],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra,
      racesActiveByEra,
    });

    expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
      { positionId: 100, raceEras: [{ raceId: 7, eraId: 500 }] },
      expect.any(Array),
    );
  });

  it('records an ImportError when an override positionId/raceId does not resolve', async () => {
    const eras = [
      makeEra({
        positions: [{ positionId: '999', raceId: '7', available: false }],
      }),
    ];
    const { service, mocks } = await makeService(eras);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      racesActiveByEra: new Set(),
    });

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('999');
  });

  it('records an ImportError when an override race bblId does not resolve', async () => {
    const eras = [
      makeEra({
        positions: [
          { positionId: '10', raceId: 'unknown-race', available: false },
        ],
      }),
    ];
    const { service, mocks } = await makeService(eras);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      racesActiveByEra: new Set(),
    });

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('unknown-race');
  });

  it('records an ImportError when an override containing era name does not resolve', async () => {
    const eras = [
      makeEra({
        identity: { name: 'Unknown era', rulesSets: ['Living rulebook'] },
        positions: [{ positionId: '10', raceId: '7', available: false }],
      }),
    ];
    const { service, mocks } = await makeService(eras);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: false, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);
    mocks.positionsImport.syncRaceEras.mockResolvedValue({
      positionId: 100,
      raceEraIds: [],
    });

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      racesActiveByEra: new Set(),
    });

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('Unknown era');
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const { service, mocks } = await makeService([makeEra()]);
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL'] },
        message: 'Failed to upsert external system: network timeout',
      },
    });
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: true, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      racesActiveByEra: new Set(),
    });

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(
      'Failed to upsert external system: network timeout',
    );
    expect(mocks.positionsImport.syncRaceEras).not.toHaveBeenCalled();
    expect(mocks.lookup.lookupMap).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService([]);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: true, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);

    const { result } = await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      racesActiveByEra: new Set(),
    });

    expect(result).toBe(CANNED_RESULT);
  });
});
