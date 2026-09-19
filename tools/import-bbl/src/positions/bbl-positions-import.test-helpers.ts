/**
 * Test-only helper. Do not import from production code.
 *
 * Shared fixtures and the `makeService` builder for
 * `BblPositionsImportService` specs, split across
 * `bbl-positions-import.service.spec.ts` and
 * `bbl-positions-import.characteristics.spec.ts`.
 */
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPlayer } from '../players/player-page-parser';
import { PlayerPageParser } from '../players/player-page-parser';
import type { BblPage } from '../source/bbl-page.types';
import { BblRaceNameService } from '../source/bbl-race-name.service';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblPositionsImportService } from './bbl-positions-import.service';
import type { BblPosition } from './position-page-parser';
import { PositionPageParser } from './position-page-parser';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; these specs
 * assert what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
export const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
export function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

/**
 * The canned ImportError the mocked PageParseErrorService.build returns.
 * PageParseErrorService's own message template — including the
 * `error instanceof Error ? error.message : String(error)` branch — is
 * covered by ../source/page-parse-error.service.spec.ts. These specs assert
 * only what BblPositionsImportService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
export const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

/**
 * The full upsert result record (PositionsImportService.upsert
 * resolves the API's Position + created shape). Defaults match the id=100
 * value repeated across these specs; pass overrides to vary the id.
 */
export function makePositionRecord(overrides: { id?: number } = {}) {
  return {
    id: overrides.id ?? 100,
    name: 'Position',
    isStarPlayer: false,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

export function ptPage(position: BblPosition | null): BblPage {
  return {
    type: 'pt',
    params: { position: JSON.stringify(position) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

export function plPage(player: BblPlayer | null): BblPage {
  return {
    type: 'pl',
    params: { player: JSON.stringify(player) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

export interface Mocks {
  positionParser: MockProxy<PositionPageParser>;
  playerParser: MockProxy<PlayerPageParser>;
  positionsImport: MockProxy<PositionsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameExternalId: MockProxy<NameExternalIdService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
  bblRaceName: MockProxy<BblRaceNameService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute.
 */
export async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblPositionsImportService; mocks: Mocks }> {
  const positionParser = mock<PositionPageParser>();
  positionParser.extractPosition.mockImplementation(
    (p) => JSON.parse(p.params.position) as BblPosition | null,
  );

  const playerParser = mock<PlayerPageParser>();
  playerParser.extractPlayer.mockImplementation(
    (p) => JSON.parse(p.params.player) as BblPlayer | null,
  );

  const positionsImport = mock<PositionsImportService>();

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  // `forStarPosition` is a pure identity passthrough with no branching or
  // formatting, so there is no algorithm here that can drift out of sync with
  // the real NameExternalIdService — exempt from the canned-response rule.
  nameExternalId.forStarPosition.mockImplementation((name) => name);

  const importResults = mock<ImportResultService>();
  // `error` is a pure identity field copy with no branching or formatting, so
  // there is no algorithm here that can drift out of sync with the real
  // ImportResultService — exempt from the canned-response rule.
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockReturnValue(CANNED_PAGE_PARSE_ERROR);

  const bblRaceName = mock<BblRaceNameService>();
  // Canned pass-through: these tests assert which race name the service under
  // test hands to the canonicalizer and to forPosition, not what the
  // canonicalizer computes -- that is BblRaceNameService's own spec's job.
  bblRaceName.canonical.mockImplementation((name) => name);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblPositionsImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: PositionPageParser, useValue: positionParser },
      { provide: PlayerPageParser, useValue: playerParser },
      { provide: PositionsImportService, useValue: positionsImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
      { provide: BblRaceNameService, useValue: bblRaceName },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblPositionsImportService),
    mocks: {
      positionParser,
      playerParser,
      positionsImport,
      bootstrap,
      nameExternalId,
      importResults,
      pageParseError,
      bblRaceName,
    },
  };
}

export const CHARACTERISTICS = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: null,
  armour: 8,
};

/**
 * An arbitrary player characteristics line. This service never reads
 * `BblPlayer.characteristics` — it only exists because the field is
 * required — so its exact values are irrelevant; shared here rather than
 * repeated at every `plPage(...)` fixture in these specs.
 */
export const ANY_PLAYER_CHARACTERISTICS: BblPlayer['characteristics'] = {
  move: 5,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 8,
};

/**
 * An arbitrary all-clean lasting-injuries value. This service never reads
 * `BblPlayer.lastingInjuries` — it only exists because the field is
 * required — so its exact values are irrelevant; shared here rather than
 * repeated at every `plPage(...)` fixture in these specs.
 */
export const ANY_LASTING_INJURIES: BblPlayer['lastingInjuries'] = {
  missNextGame: false,
  nigglingInjuryCount: 0,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

/**
 * An arbitrary all-zero characteristic-increase-counts value. This service
 * never reads `BblPlayer.characteristicIncreaseCounts` — it only exists
 * because the field is required — so its exact values are irrelevant; shared
 * here rather than repeated at every `plPage(...)` fixture in these specs.
 */
export const ANY_CHARACTERISTIC_INCREASE_COUNTS: BblPlayer['characteristicIncreaseCounts'] =
  {
    move: 0,
    strength: 0,
    agility: 0,
    passing: 0,
    armour: 0,
  };

export const racesByBblId = new Map<string, { id: number; name: string }>([
  ['48', { id: 480, name: 'College of Shadow' }],
  ['7', { id: 70, name: 'Goblin Team' }],
  ['14', { id: 140, name: 'Norse Team' }],
]);

export const teamRaceIdsByCode = new Map<string, number>([
  ['knu', 140],
  ['col', 480],
]);
