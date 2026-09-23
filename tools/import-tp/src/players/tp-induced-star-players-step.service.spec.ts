import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { TpEraRulesSetResolverService } from '../eras/tp-era-rules-set-resolver.service';
import {
  mockEraDataConfigService,
  mockImportResultService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { InducedStarPlayerHireGroup } from './tp-induced-star-players-import.service';
import { TpInducedStarPlayersImportService } from './tp-induced-star-players-import.service';
import { TpInducedStarPlayersStepService } from './tp-induced-star-players-step.service';

/** The numeric id the mocked bootstrap assigns to the TP/Name external systems. */
const TP_SYSTEM_ID = 1;
const NAME_SYSTEM_ID = 2;

const CHARACTERISTICS_BY_POSITION_ID = new Map<
  number,
  Map<number, TpPositionCharacteristics>
>();

function group(
  overrides: Partial<InducedStarPlayerHireGroup> = {},
): InducedStarPlayerHireGroup {
  return {
    rosterId: 1,
    eraId: 40,
    starPlayers: [],
    ...overrides,
  };
}

async function makeService(
  options: {
    eraNames?: string[];
    eraIdsByName?: Map<string, number>;
    bootstrap?: () => Promise<
      { ok: true; ids: number[] } | { ok: false; error: ImportError }
    >;
    getEras?: () => EraDataConfig[];
    importHiresResult?: {
      imported: number;
      starPlayerIdsByRosterAndMaster: Map<string, number>;
      insertedPlayerIds: number[];
    };
  } = {},
): Promise<{
  service: TpInducedStarPlayersStepService;
  externalSystemBootstrap: MockProxy<ExternalSystemBootstrapService>;
  eraConfig: MockProxy<EraDataConfigService>;
  lookup: MockProxy<ReferenceLookupService>;
  eraRulesSetResolver: MockProxy<TpEraRulesSetResolverService>;
  inducedStarPlayers: MockProxy<TpInducedStarPlayersImportService>;
  importResults: MockProxy<ImportResultService>;
}> {
  const {
    eraNames = ['Fourth era'],
    eraIdsByName = new Map([['Fourth era', 40]]),
    importHiresResult = {
      imported: 0,
      starPlayerIdsByRosterAndMaster: new Map(),
      insertedPlayerIds: [],
    },
  } = options;

  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    options.bootstrap ??
      (() =>
        Promise.resolve({ ok: true, ids: [TP_SYSTEM_ID, NAME_SYSTEM_ID] })),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockReturnValue('TP');
  const eraConfig = mockEraDataConfigService(eraNames);
  if (options.getEras) {
    eraConfig.getEras.mockImplementation(options.getEras);
  }
  const lookup = mockReferenceLookupService(eraIdsByName, TP_SYSTEM_ID);
  const eraRulesSetResolver = mock<TpEraRulesSetResolverService>();
  eraRulesSetResolver.resolveRulesSetIdByEraName.mockResolvedValue(new Map());
  const inducedStarPlayers = mock<TpInducedStarPlayersImportService>();
  inducedStarPlayers.importHires.mockResolvedValue(importHiresResult);
  const importResults = mockImportResultService();
  importResults.result.mockImplementation(({ imported, errors }) => ({
    success: errors.length === 0,
    imported,
    errors,
  }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpInducedStarPlayersStepService,
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: EraDataConfigService, useValue: eraConfig },
      { provide: ReferenceLookupService, useValue: lookup },
      { provide: TpEraRulesSetResolverService, useValue: eraRulesSetResolver },
      {
        provide: TpInducedStarPlayersImportService,
        useValue: inducedStarPlayers,
      },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(TpInducedStarPlayersStepService),
    externalSystemBootstrap,
    eraConfig,
    lookup,
    eraRulesSetResolver,
    inducedStarPlayers,
    importResults,
  };
}

describe('TpInducedStarPlayersStepService', () => {
  it('does nothing for no hire groups', async () => {
    const { service, externalSystemBootstrap, inducedStarPlayers } =
      await makeService();

    const outcome = await service.importStarHires({
      groups: [],
      teamErasByRosterId: new Map(),
      characteristicsByPositionId: CHARACTERISTICS_BY_POSITION_ID,
    });

    expect(externalSystemBootstrap.bootstrap).not.toHaveBeenCalled();
    expect(inducedStarPlayers.importHires).not.toHaveBeenCalled();
    expect(outcome.result).toEqual({ success: true, imported: 0, errors: [] });
    expect(outcome.starPlayerIdsByRosterAndMaster.size).toBe(0);
    expect(outcome.insertedPlayerIds).toEqual([]);
  });

  it('bootstraps TP and Name, then hands the hires their context', async () => {
    const teamErasByRosterId = new Map([[1, [{ id: 30, eraId: 40 }]]]);
    const { service, inducedStarPlayers } = await makeService();
    const groups = [group()];

    await service.importStarHires({
      groups,
      teamErasByRosterId,
      characteristicsByPositionId: CHARACTERISTICS_BY_POSITION_ID,
    });

    expect(inducedStarPlayers.importHires).toHaveBeenCalledWith({
      groups,
      teamErasByRosterId,
      context: {
        tpSystemId: TP_SYSTEM_ID,
        nameSystemId: NAME_SYSTEM_ID,
        eraNameByEraId: new Map([[40, 'Fourth era']]),
        rulesSetIdByEraName: new Map(),
        characteristicsByPositionId: CHARACTERISTICS_BY_POSITION_ID,
      },
      errors: [],
    });
  });

  it('resolves rules sets only for the eras a hire was made in', async () => {
    const { service, eraRulesSetResolver } = await makeService({
      eraNames: ['Fourth era', 'Fifth era'],
      eraIdsByName: new Map([
        ['Fourth era', 40],
        ['Fifth era', 41],
      ]),
    });

    await service.importStarHires({
      groups: [group({ eraId: 40 })],
      teamErasByRosterId: new Map(),
      characteristicsByPositionId: CHARACTERISTICS_BY_POSITION_ID,
    });

    expect(eraRulesSetResolver.resolveRulesSetIdByEraName).toHaveBeenCalledWith(
      expect.objectContaining({
        eras: [expect.objectContaining({ name: 'Fourth era' })],
      }),
    );
  });

  it('records the bootstrap error and imports nothing', async () => {
    const bootstrapError: ImportError = {
      item: { externalSystems: ['TP', 'Name'] },
      message: 'boom',
    };
    const { service, inducedStarPlayers } = await makeService({
      bootstrap: () => Promise.resolve({ ok: false, error: bootstrapError }),
    });

    const outcome = await service.importStarHires({
      groups: [group()],
      teamErasByRosterId: new Map(),
      characteristicsByPositionId: CHARACTERISTICS_BY_POSITION_ID,
    });

    expect(inducedStarPlayers.importHires).not.toHaveBeenCalled();
    expect(outcome.result.errors).toEqual([bootstrapError]);
  });

  it('records one error when the era config cannot be read', async () => {
    const { service } = await makeService({
      getEras: () => {
        throw new Error('bad config');
      },
    });

    const outcome = await service.importStarHires({
      groups: [group()],
      teamErasByRosterId: new Map(),
      characteristicsByPositionId: CHARACTERISTICS_BY_POSITION_ID,
    });

    expect(outcome.result.errors).toHaveLength(1);
    expect(outcome.result.errors[0].item).toEqual({ externalSystems: ['TP'] });
  });

  it("returns the hires' star player ids, inserted ids and imported count", async () => {
    const { service } = await makeService({
      importHiresResult: {
        imported: 3,
        starPlayerIdsByRosterAndMaster: new Map([['1:77', 900]]),
        insertedPlayerIds: [900],
      },
    });

    const outcome = await service.importStarHires({
      groups: [group()],
      teamErasByRosterId: new Map(),
      characteristicsByPositionId: CHARACTERISTICS_BY_POSITION_ID,
    });

    expect(outcome.result.imported).toBe(3);
    expect(outcome.starPlayerIdsByRosterAndMaster).toEqual(
      new Map([['1:77', 900]]),
    );
    expect(outcome.insertedPlayerIds).toEqual([900]);
  });
});
