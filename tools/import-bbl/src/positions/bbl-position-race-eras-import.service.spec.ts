import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  PositionRaceEraEligibilityService,
  PositionsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { type EraConfig, EraConfigService } from '../eras/era-config.service';
import { mockReferenceLookup } from '../shared/reference-lookup-mock.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblPositionRaceErasImportService } from './bbl-position-race-eras-import.service';
import type { BblPositionCharacteristics } from './position-page-parser';

function makeEra(overrides: Partial<EraConfig> = {}): EraConfig {
  return {
    identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
    dates: { startDate: '2011-09-09', autoAssignByDate: true },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
    ...overrides,
  };
}

/** A RulesSet record as the rules-sets step returns it; only id/name/passingFormat matter here. */
function makeRulesSet(
  id: number,
  name: string,
  passingFormat: 'absent' | 'bare' | 'plus' = 'plus',
) {
  return {
    id,
    name,
    moveFormat: 'bare' as const,
    strengthFormat: 'bare' as const,
    agilityFormat: 'plus' as const,
    passingFormat,
    armourFormat: 'plus' as const,
    createdAt: new Date('2026-01-01'),
  };
}

const rulesSetsByName = new Map([
  ['Living rulebook', makeRulesSet(10, 'Living rulebook', 'absent')],
  ['BB2020', makeRulesSet(20, 'BB2020', 'plus')],
]);

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

interface Mocks {
  positionsImport: MockProxy<PositionsImportService>;
  eraConfig: MockProxy<EraConfigService>;
  importResults: MockProxy<ImportResultService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  lookup: MockProxy<ReferenceLookupService>;
  eligibility: MockProxy<PositionRaceEraEligibilityService>;
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
  mockReferenceLookup(lookup, {
    era: idsByName,
    position: positionIdsByExternalId,
  });

  const eligibility = mock<PositionRaceEraEligibilityService>();
  eligibility.isEligible.mockReturnValue(true);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblPositionRaceErasImportService,
      { provide: PositionsImportService, useValue: positionsImport },
      { provide: EraConfigService, useValue: eraConfig },
      { provide: ImportResultService, useValue: importResults },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: ReferenceLookupService, useValue: lookup },
      { provide: PositionRaceEraEligibilityService, useValue: eligibility },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblPositionRaceErasImportService),
    mocks: {
      positionsImport,
      eraConfig,
      importResults,
      bootstrap,
      lookup,
      eligibility,
    },
  };
}

describe('BblPositionRaceErasImportService', () => {
  const racesByBblId = new Map<string, { id: number; name: string }>([
    ['7', { id: 7, name: 'Orcs' }],
  ]);
  const characteristicsByPositionId = new Map<
    number,
    BblPositionCharacteristics
  >();

  it('resolves configured eras and position overrides through the api once for the whole run', async () => {
    const { service, mocks } = await makeService([makeEra()]);
    const positionRaceCandidates = new Map([
      [100, { isStarPlayer: true, raceDbIds: new Set([7]) }],
    ]);
    const eraIdsByRaceId = new Map<number, Set<number>>([[7, new Set([500])]]);

    await service.syncPositionRaceEras({
      positionRaceCandidates,
      racesByBblId,
      rulesSetsByName,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      characteristicsByPositionId,
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
      rulesSetsByName,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      characteristicsByPositionId,
    });

    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith(
      'position',
      expect.arrayContaining([
        { externalSystemId: BBL_SYSTEM_ID, externalId: '10-7' },
      ]),
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
      rulesSetsByName,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      characteristicsByPositionId,
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
      rulesSetsByName,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      characteristicsByPositionId,
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
      rulesSetsByName,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      characteristicsByPositionId,
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
      rulesSetsByName,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      characteristicsByPositionId,
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
      rulesSetsByName,
      eraIdsByRaceId,
      positionsUsedByEra: new Set(),
      characteristicsByPositionId,
    });

    expect(result).toBe(CANNED_RESULT);
  });

  describe('eligibility and characteristics', () => {
    const options = {
      positionRaceCandidates: new Map([
        [1, { isStarPlayer: false, raceDbIds: new Set([7]) }],
      ]),
      racesByBblId,
      rulesSetsByName,
      eraIdsByRaceId: new Map<number, Set<number>>([[7, new Set([20])]]),
      positionsUsedByEra: new Set(['1:20']),
      characteristicsByPositionId: new Map<
        number,
        BblPositionCharacteristics
      >(),
    };
    const eraWithBb2020 = makeEra({
      identity: { name: 'BB2020', rulesSets: ['BB2020'] },
    });
    const eraIdsById = new Map<string, number>([['BB2020', 20]]);

    it('asks the shared eligibility service once per (race, era) pair', async () => {
      const { service, mocks } = await makeService([eraWithBb2020], eraIdsById);
      mocks.eligibility.isEligible.mockReturnValue(true);

      await service.syncPositionRaceEras(options);

      expect(mocks.eligibility.isEligible).toHaveBeenCalledWith({
        override: undefined,
        isStarPlayer: false,
        hasPositiveEvidence: true,
      });
    });

    it('omits an entry the eligibility service rejects', async () => {
      const { service, mocks } = await makeService([eraWithBb2020], eraIdsById);
      mocks.eligibility.isEligible.mockReturnValue(false);
      mocks.positionsImport.syncRaceEras.mockResolvedValue({
        positionId: 1,
        raceEraIds: [],
      });

      await service.syncPositionRaceEras(options);

      expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
        { positionId: 1, raceEras: [] },
        expect.anything(),
      );
    });

    it('attaches the scraped characteristics under the era last rules set', async () => {
      const { service, mocks } = await makeService([eraWithBb2020], eraIdsById);
      mocks.eligibility.isEligible.mockReturnValue(true);
      mocks.positionsImport.syncRaceEras.mockResolvedValue({
        positionId: 1,
        raceEraIds: [1],
      });

      await service.syncPositionRaceEras({
        ...options,
        characteristicsByPositionId: new Map([
          [1, { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 }],
        ]),
      });

      expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
        {
          positionId: 1,
          raceEras: [
            {
              raceId: 7,
              eraId: 20,
              characteristics: {
                rulesSetId: 20,
                move: 6,
                strength: 3,
                agility: 3,
                passing: 4,
                armour: 9,
              },
            },
          ],
        },
        expect.anything(),
      );
    });

    it('sends a null passing for an era whose rules set has no Passing', async () => {
      const era = makeEra({
        identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
      });
      const idsByName = new Map([['Living rulebook', 10]]);
      const { service, mocks } = await makeService([era], idsByName);
      mocks.eligibility.isEligible.mockReturnValue(true);
      mocks.positionsImport.syncRaceEras.mockResolvedValue({
        positionId: 1,
        raceEraIds: [1],
      });

      await service.syncPositionRaceEras({
        ...options,
        eraIdsByRaceId: new Map([[7, new Set([10])]]),
        positionsUsedByEra: new Set(['1:10']),
        characteristicsByPositionId: new Map([
          [1, { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 }],
        ]),
      });

      expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
        {
          positionId: 1,
          raceEras: [
            {
              raceId: 7,
              eraId: 10,
              characteristics: {
                rulesSetId: 10,
                move: 6,
                strength: 3,
                agility: 3,
                passing: null,
                armour: 9,
              },
            },
          ],
        },
        expect.anything(),
      );
    });

    it('sends 0 for a position the page showed as unable to pass', async () => {
      const { service, mocks } = await makeService([eraWithBb2020], eraIdsById);
      mocks.eligibility.isEligible.mockReturnValue(true);
      mocks.positionsImport.syncRaceEras.mockResolvedValue({
        positionId: 1,
        raceEraIds: [1],
      });

      await service.syncPositionRaceEras({
        ...options,
        characteristicsByPositionId: new Map([
          [1, { move: 6, strength: 3, agility: 3, passing: null, armour: 9 }],
        ]),
      });

      expect(
        mocks.positionsImport.syncRaceEras.mock.calls[0][0].raceEras[0]
          ?.characteristics?.passing,
      ).toBe(0);
    });

    it('records availability with no characteristics when the page did not parse', async () => {
      const { service, mocks } = await makeService([eraWithBb2020], eraIdsById);
      mocks.eligibility.isEligible.mockReturnValue(true);
      mocks.positionsImport.syncRaceEras.mockResolvedValue({
        positionId: 1,
        raceEraIds: [1],
      });

      await service.syncPositionRaceEras({
        ...options,
        characteristicsByPositionId: new Map(),
      });

      expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
        { positionId: 1, raceEras: [{ raceId: 7, eraId: 20 }] },
        expect.anything(),
      );
    });

    it('records an error and omits characteristics when the era last rules set is unknown', async () => {
      const era = makeEra({
        identity: { name: 'BB2020', rulesSets: ['Nonexistent'] },
      });
      const { service, mocks } = await makeService([era], eraIdsById);
      mocks.eligibility.isEligible.mockReturnValue(true);
      mocks.positionsImport.syncRaceEras.mockResolvedValue({
        positionId: 1,
        raceEraIds: [1],
      });

      await service.syncPositionRaceEras({
        ...options,
        characteristicsByPositionId: new Map([
          [1, { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 }],
        ]),
      });

      expect(mocks.positionsImport.syncRaceEras).toHaveBeenCalledWith(
        { positionId: 1, raceEras: [{ raceId: 7, eraId: 20 }] },
        expect.anything(),
      );
      expect(resultArgs(mocks.importResults).errors).toEqual([
        {
          item: { positionId: 1, rulesSets: ['Nonexistent'] },
          message:
            'Could not resolve rules set(s) "Nonexistent" for position 1: not upserted by the rules sets step',
        },
      ]);
    });
  });
});
