import type {
  ImportError,
  ImportResult,
  MatchDateRange,
} from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  MatchDateRangeService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { type EraConfig, EraConfigService } from '../eras/era-config.service';
import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatch } from '../matches/match-list-page-parser';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblCompetitionsImportService } from './bbl-competitions-import.service';
import { CompetitionListPageParser } from './competition-list-page-parser';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; specs assert
 * what the service under test *passes to* result() (via `resultArgs()`) and
 * that it returns result()'s value unchanged. The deliberately impossible
 * field values make any leftover assertion that reads the returned object
 * instead of the recorded call arguments fail loudly.
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
 * covered by ../source/page-parse-error.service.spec.ts. Specs assert only
 * what BblCompetitionsImportService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
export const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

export const erasConfig: EraConfig[] = [
  {
    identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
    dates: {
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
  },
  {
    identity: { name: 'BB2020', rulesSets: ['BB2020'] },
    dates: { startDate: '2021-09-01', autoAssignByDate: true },
    players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
  },
];

/** The numeric id the mocked bootstrap assigns to the BBL external system. */
export const BBL_SYSTEM_ID = 1;

/** The default era name -> DB id resolution the mocked lookup answers with. */
export const eraIdsByName = new Map<string, number>([
  ['Living rulebook', 100],
  ['BB2020', 200],
]);

/**
 * Configures `lookup.lookupMap` to resolve any era ref whose name appears in
 * `idsByName`, keyed via the mocked (deterministic) `keyOf`. Mirrors what
 * ReferenceLookupService itself does, without reimplementing its resolution
 * algorithm (idsByName is supplied by the caller, not derived here).
 */
export function mockEraLookup(
  lookup: MockProxy<ReferenceLookupService>,
  idsByName: Map<string, number>,
): void {
  lookup.lookupMap.mockImplementation((_kind, refs) =>
    Promise.resolve(
      new Map(
        refs
          .filter((ref) => idsByName.has(ref.externalId))
          .map((ref) => [
            lookup.keyOf(ref),
            idsByName.get(ref.externalId) as number,
          ]),
      ),
    ),
  );
}

/**
 * The canned range the mocked MatchDateRangeService returns by default:
 * an 11-day span (=> season) inside the "Living rulebook" era. The real
 * min/max/span arithmetic is covered by
 * packages/import/src/match-date-range.service.spec.ts; each test stubs the
 * exact range it expects and asserts what the service does with it.
 */
export const CANNED_RANGE: MatchDateRange = {
  earliestDate: new Date(Date.UTC(2011, 11, 7)),
  latestDate: new Date(Date.UTC(2011, 11, 18)),
  spanDays: 11,
};

/**
 * A canned full-row `upsertCompetitionResult` response for a given id. Specs
 * only assert what the service under test passes to upsertCompetitionResult
 * and how it reads `.id` from the resolved value — the other fields are
 * unused filler needed only to satisfy the widened return type (see
 * packages/import/src/competitions-import.service.ts).
 */
export const upsertedCompetition = (id: number) => ({
  id,
  name: 'Some competition',
  type: 'season' as const,
  eraId: 1,
  teamEraIds: [],
  startDate: '2024-01-01',
  endDate: '2024-06-01',
  competitionGroupId: 1,
  createdAt: new Date('2026-01-01'),
  created: true,
});

/** A fake page carrying only params; its load() must never be called (parser is mocked). */
export function page(type: string, params: Record<string, string>): BblPage {
  return {
    type,
    params,
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

/** date-only fixtures turned into per-competition BblMatch arrays for the reader mock. */
export function matchesByCompetition(
  datesById: Record<string, Date[]>,
): Map<string, BblMatch[]> {
  return new Map(
    Object.entries(datesById).map(([id, dates]) => [
      id,
      dates.map((date, i) => ({ bblId: `${id}-${i}`, date })),
    ]),
  );
}

export interface Mocks {
  listParser: MockProxy<CompetitionListPageParser>;
  matchListReader: MockProxy<BblMatchListReaderService>;
  competitionsImport: MockProxy<CompetitionsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  eraConfig: MockProxy<EraConfigService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
  dateRange: MockProxy<MatchDateRangeService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute. The
 * mocked lookup resolves eras by name via `idsByName` (defaulting to
 * `eraIdsByName`); a test wanting different resolution results reconfigures
 * `mocks.lookup` with `mockEraLookup` after construction.
 */
export async function makeService(
  reader: BblSourceReader,
  idsByName: Map<string, number> = eraIdsByName,
): Promise<{ service: BblCompetitionsImportService; mocks: Mocks }> {
  const listParser = mock<CompetitionListPageParser>();

  const matchListReader = mock<BblMatchListReaderService>();
  matchListReader.getMatchesByCompetitionId.mockResolvedValue(new Map());

  const competitionsImport = mock<CompetitionsImportService>();

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [BBL_SYSTEM_ID] });

  const eraConfig = mock<EraConfigService>();
  eraConfig.getEras.mockReturnValue(erasConfig);

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

  const dateRange = mock<MatchDateRangeService>();
  dateRange.computeRange.mockReturnValue(CANNED_RANGE);

  const lookup = mock<ReferenceLookupService>();
  // `keyOf` is a pure, deterministic key derivation with no branching that
  // could drift from ReferenceLookupService's own real implementation --
  // exempt from the canned-response rule, same as the other passthroughs.
  lookup.keyOf.mockImplementation(
    (ref) => `${ref.externalSystemId}\t${ref.externalId}`,
  );
  mockEraLookup(lookup, idsByName);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblCompetitionsImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: CompetitionListPageParser, useValue: listParser },
      { provide: BblMatchListReaderService, useValue: matchListReader },
      { provide: CompetitionsImportService, useValue: competitionsImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: EraConfigService, useValue: eraConfig },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
      { provide: MatchDateRangeService, useValue: dateRange },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblCompetitionsImportService),
    mocks: {
      listParser,
      matchListReader,
      competitionsImport,
      bootstrap,
      eraConfig,
      importResults,
      pageParseError,
      dateRange,
      lookup,
    },
  };
}
