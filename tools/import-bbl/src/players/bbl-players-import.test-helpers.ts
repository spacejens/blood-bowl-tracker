import type {
  CharacteristicFormat,
  RulesSet,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  PlayersImportService,
  ReferenceLookupService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { type EraConfig, EraConfigService } from '../eras/era-config.service';
import { mockReferenceLookup } from '../shared/reference-lookup-mock.test-helpers';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblPlayersImportService } from './bbl-players-import.service';
import type { BblPlayer } from './player-page-parser';
import { PlayerPageParser } from './player-page-parser';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
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
 * The canned ImportError the mocked PageParseErrorService.build returns. No
 * test in this file exercises BblPlayersImportService's `pageParseError.build`
 * call path, so this constant only backs the mock's default return value —
 * build()'s own message-template algorithm is covered by
 * ../source/page-parse-error.service.spec.ts.
 */
export const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

export function plPage(player: BblPlayer | null, pid = '388'): BblPage {
  return {
    type: 'pl',
    params: { player: JSON.stringify(player), pid },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

/** The numeric id the mocked bootstrap assigns to the BBL external system. */
export const BBL_SYSTEM_ID = 1;

export const team: UpsertTeam = {
  name: 'Knights',
  raceId: 70, // DB race id
  coachId: 9,
  eras: [],
  externalIds: [],
};
export const teamsByCode = new Map<string, UpsertTeam>([['knu', team]]);
export const racesByBblId = new Map<string, { id: number; name: string }>([
  ['7', { id: 70, name: 'Goblin Team' }],
]);

/** The default era name -> DB id resolution the mocked lookup answers with. */
export const eraIdsByName = new Map<string, number>([['LRB', 500]]);

/**
 * The default position `typId-raceBblId` -> DB id resolution the mocked
 * lookup answers with. goodPlayer's typId is '33'; its team (Knights, DB
 * race id 70) maps to BBL race id '7' via racesByBblId, so '33-7' is the
 * composite external id.
 */
export const positionIdsByExternalId = new Map<string, number>([['33-7', 200]]);

export const defaultEras: EraConfig[] = [
  {
    identity: { name: 'LRB', rulesSets: ['LRB'] },
    dates: { startDate: '2011-09-09', autoAssignByDate: true },
    players: {
      firstPlayerId: 1,
      lastPlayerId: 9999,
      autoAssignByPlayerId: true,
    },
  },
];

export interface Mocks {
  parser: MockProxy<PlayerPageParser>;
  playersImport: MockProxy<PlayersImportService>;
  teamsImport: MockProxy<TeamsImportService>;
  eraConfig: MockProxy<EraConfigService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
  upsertFieldNarrowing: MockProxy<UpsertFieldNarrowingService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/**
 * The full upsert result record (TeamsImportService.upsert resolves
 * the API's Team + created shape). The subject under test only reads `.eras`,
 * so the other fields are unremarkable defaults.
 */
export function makeTeamRecord(eras: { id: number; eraId: number }[]) {
  return {
    id: 1,
    name: 'Team',
    raceId: 70,
    coachId: 9,
    eras,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute.
 * `eras` seeds the EraConfigService mock since every test needs its own era
 * set. `idsByName` seeds the mocked lookup's era resolution (defaulting to
 * `eraIdsByName`); a test wanting different resolution results passes its own
 * map. Position resolution always defaults to `positionIdsByExternalId`; no
 * test in this file needs a different one.
 */
export async function makeService(
  reader: BblSourceReader,
  eras: EraConfig[] = defaultEras,
  idsByName: Map<string, number> = eraIdsByName,
): Promise<{ service: BblPlayersImportService; mocks: Mocks }> {
  const parser = mock<PlayerPageParser>();
  parser.extractPlayer.mockImplementation(
    (p) => JSON.parse(p.params.player) as BblPlayer | null,
  );

  const playersImport = mock<PlayersImportService>();
  playersImport.upsertPlayerResult.mockResolvedValue({ id: 900 });

  const teamsImport = mock<TeamsImportService>();
  teamsImport.upsert.mockResolvedValue(
    makeTeamRecord([{ id: 5000, eraId: 500 }]),
  );

  const eraConfig = mock<EraConfigService>();
  eraConfig.getEras.mockReturnValue(eras);

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [BBL_SYSTEM_ID] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

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

  const upsertFieldNarrowing = mock<UpsertFieldNarrowingService>();
  // Every team fixture in this spec has a defined raceId, so the mock simply
  // passes it through rather than re-deriving the throw-if-undefined
  // invariant, which is covered by the real service's own spec.
  upsertFieldNarrowing.resolveDefiniteRaceId.mockImplementation(
    (t) => t.raceId as number,
  );

  const lookup = mock<ReferenceLookupService>();
  mockReferenceLookup(lookup, {
    era: idsByName,
    position: positionIdsByExternalId,
  });

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblPlayersImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: PlayerPageParser, useValue: parser },
      { provide: PlayersImportService, useValue: playersImport },
      { provide: TeamsImportService, useValue: teamsImport },
      { provide: EraConfigService, useValue: eraConfig },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
      {
        provide: UpsertFieldNarrowingService,
        useValue: upsertFieldNarrowing,
      },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblPlayersImportService),
    mocks: {
      parser,
      playersImport,
      teamsImport,
      eraConfig,
      bootstrap,
      importResults,
      pageParseError,
      upsertFieldNarrowing,
      lookup,
    },
  };
}

export const goodPlayer: BblPlayer = {
  pid: '42',
  name: 'Griff Oberwald',
  typId: '33',
  teamCode: 'knu',
  sppTotal: null,
  characteristics: {
    move: 5,
    strength: 3,
    agility: 3,
    passing: 4,
    armour: 8,
  },
};

/**
 * The default `importPlayers` options every test in this package's player
 * specs passes. Collected here so a new required option is added once, not
 * at every call site; a test needing a variant spreads and overrides it
 * (e.g. `{ ...importOptions, teamsByCode: localTeamsByCode }`).
 */
/**
 * A RulesSet as the rules-sets import step hands it over. Only `id` and
 * `passingFormat` matter to BblPlayersImportService; the rest are
 * unremarkable defaults so the fixture satisfies the contract type.
 */
export function makeRulesSet(
  name: string,
  passingFormat: CharacteristicFormat,
): RulesSet {
  return {
    id: 800,
    name,
    moveFormat: 'bare',
    strengthFormat: 'bare',
    agilityFormat: 'plus',
    passingFormat,
    armourFormat: 'plus',
    createdAt: new Date('2026-01-01'),
  };
}

/**
 * The default rules-set resolution. `defaultEras`' only era ("LRB") lists
 * exactly one rules set, also named "LRB", and it has Passing — so by default
 * a player's parsed Passing value is sent through unchanged.
 */
export const rulesSetsByName = new Map<string, RulesSet>([
  ['LRB', makeRulesSet('LRB', 'plus')],
]);

export const importOptions = {
  teamsByCode,
  racesByBblId,
  rulesSetsByName,
};
