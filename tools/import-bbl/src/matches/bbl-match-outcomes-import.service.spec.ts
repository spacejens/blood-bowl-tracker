import type {
  ResolveMatchOutcomesResult,
  UpsertCompetition,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  MatchOutcomesImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BblCompetitionTrophyReaderService } from './bbl-competition-trophy-reader.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import type { ImportBblMatchOutcomesOptions } from './bbl-match-outcomes-import.service';
import { BblMatchOutcomesImportService } from './bbl-match-outcomes-import.service';
import type { CompetitionTrophyPlacements } from './competition-trophy-page-parser';
import type { BblMatch } from './match-list-page-parser';
import type { MatchMergeResolution } from './match-merge.service';
import { MatchMergeService } from './match-merge.service';
import { MatchResultConfigService } from './match-result-config.service';

const COMPETITION_BBL_ID = '69';
const COMPETITION_DB_ID = 7;
const MATCH_BBL_ID = '1830';
const MATCH_DB_ID = 11;
/** The numeric id the mocked bootstrap would assign to the BBL external system. */
const BBL_SYSTEM_ID = 1;

const COMPETITION: UpsertCompetition = {
  name: 'Major Season 3',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [
    { externalSystemId: BBL_SYSTEM_ID, externalId: COMPETITION_BBL_ID },
  ],
};

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

/**
 * Reflects the real ImportResultService.result() shape (a pure field copy,
 * not branching logic to guard against drift) so a test can assert on the
 * returned result's errors/success directly, rather than only on the args
 * recorded via resultArgs().
 */
function useRealResult(importResults: MockProxy<ImportResultService>): void {
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));
}

/** A resolution with no merged pairs: every match resolves independently. */
function noMergeResolution(): MatchMergeResolution {
  return {
    primaryBblIdByBblId: new Map(),
    partnerBblId: () => undefined,
    isPrimary: () => false,
    isSecondary: () => false,
    effectivePlayedAt: (_bblId, rawDate) => rawDate,
  };
}

function match(bblId: string): BblMatch {
  return { bblId, date: new Date(0) };
}

const DEFAULT_OUTCOME_RESULT: ResolveMatchOutcomesResult = {
  competitionId: COMPETITION_DB_ID,
  resolvedMatchIds: [MATCH_DB_ID],
  unresolvedMatchIds: [],
};

interface Mocks {
  matchListReader: MockProxy<BblMatchListReaderService>;
  trophyReader: MockProxy<BblCompetitionTrophyReaderService>;
  resultConfig: MockProxy<MatchResultConfigService>;
  matchMerge: MockProxy<MatchMergeService>;
  matchOutcomes: MockProxy<MatchOutcomesImportService>;
  importResults: MockProxy<ImportResultService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/**
 * Configures `lookup.lookupMap` to resolve any 'competition' ref whose
 * external id appears in `competitionIdsByBblId`, keyed via the mocked
 * (deterministic) `keyOf`. Mirrors what ReferenceLookupService itself does,
 * without reimplementing its resolution algorithm.
 */
function mockCompetitionLookup(
  lookup: MockProxy<ReferenceLookupService>,
  competitionIdsByBblId: Map<string, number>,
): void {
  lookup.lookupMap.mockImplementation((kind, refs) => {
    if (kind !== 'competition') {
      return Promise.resolve(new Map<string, number>());
    }
    return Promise.resolve(
      new Map(
        refs
          .filter((ref) => competitionIdsByBblId.has(ref.externalId))
          .map((ref) => [
            lookup.keyOf(ref),
            competitionIdsByBblId.get(ref.externalId) as number,
          ]),
      ),
    );
  });
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. Seeded with one competition ('69' -> db 7) holding one
 * match ('1830' -> db 11), no trophy placements, and no overrides by default;
 * each test overrides only what it needs before calling importMatchOutcomes.
 */
async function makeService(seed?: {
  matches?: Map<string, BblMatch[]>;
  placements?: Map<string, CompetitionTrophyPlacements>;
  overrides?: Map<string, string | null>;
  merges?: MatchMergeResolution;
  outcomeResult?: ResolveMatchOutcomesResult;
  competitionIdsByBblId?: Map<string, number>;
}): Promise<{ service: BblMatchOutcomesImportService; mocks: Mocks }> {
  const matchListReader = mock<BblMatchListReaderService>();
  matchListReader.getMatchesByCompetitionId.mockResolvedValue(
    seed?.matches ?? new Map([[COMPETITION_BBL_ID, [match(MATCH_BBL_ID)]]]),
  );

  const trophyReader = mock<BblCompetitionTrophyReaderService>();
  trophyReader.getPlacementsByCompetitionId.mockResolvedValue(
    seed?.placements ?? new Map<string, CompetitionTrophyPlacements>(),
  );

  const resultConfig = mock<MatchResultConfigService>();
  resultConfig.getResultOverrides.mockReturnValue(
    seed?.overrides ?? new Map<string, string | null>(),
  );

  const matchMerge = mock<MatchMergeService>();
  matchMerge.resolve.mockResolvedValue(seed?.merges ?? noMergeResolution());

  const matchOutcomes = mock<MatchOutcomesImportService>();
  matchOutcomes.resolveOutcomes.mockResolvedValue(
    seed?.outcomeResult ?? DEFAULT_OUTCOME_RESULT,
  );

  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const lookup = mock<ReferenceLookupService>();
  // `keyOf` is a pure, deterministic key derivation with no branching that
  // could drift from ReferenceLookupService's own real implementation --
  // exempt from the canned-response rule, same as the other passthroughs.
  lookup.keyOf.mockImplementation(
    (ref) => `${ref.externalSystemId}\t${ref.externalId}`,
  );
  mockCompetitionLookup(
    lookup,
    seed?.competitionIdsByBblId ??
      new Map([[COMPETITION_BBL_ID, COMPETITION_DB_ID]]),
  );

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchOutcomesImportService,
      { provide: BblMatchListReaderService, useValue: matchListReader },
      { provide: BblCompetitionTrophyReaderService, useValue: trophyReader },
      { provide: MatchResultConfigService, useValue: resultConfig },
      { provide: MatchMergeService, useValue: matchMerge },
      { provide: MatchOutcomesImportService, useValue: matchOutcomes },
      { provide: ImportResultService, useValue: importResults },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblMatchOutcomesImportService),
    mocks: {
      matchListReader,
      trophyReader,
      resultConfig,
      matchMerge,
      matchOutcomes,
      importResults,
      lookup,
    },
  };
}

/** Default options: one imported competition/match, all team codes resolvable. */
function defaultOptions(
  overrides: Partial<ImportBblMatchOutcomesOptions> = {},
): ImportBblMatchOutcomesOptions {
  return {
    competitionsByBblId: new Map([[COMPETITION_BBL_ID, COMPETITION]]),
    matchIdsByBblId: new Map([[MATCH_BBL_ID, MATCH_DB_ID]]),
    categoriesByBblId: new Map([[MATCH_BBL_ID, 'normal']]),
    teamEraIdsByCompetitionBblId: new Map([
      [
        COMPETITION_BBL_ID,
        new Map([
          ['sew', 501],
          ['vor', 502],
          ['nur', 503],
        ]),
      ],
    ]),
    ...overrides,
  };
}

describe('BblMatchOutcomesImportService', () => {
  it('sends the trophy winner as a tie-break for a cup final', async () => {
    const { service, mocks } = await makeService({
      placements: new Map([
        [COMPETITION_BBL_ID, { first: 'sew', second: 'vor', third: 'nur' }],
      ]),
    });
    const options = defaultOptions({
      categoriesByBblId: new Map([[MATCH_BBL_ID, 'cup_final']]),
    });

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      {
        competitionId: COMPETITION_DB_ID,
        overrides: [],
        tieBreaks: [{ matchId: MATCH_DB_ID, winnerTeamEraId: 501 }],
      },
      expect.anything(),
    );
  });

  it('sends the third-place team as a tie-break for a bronze match', async () => {
    const { service, mocks } = await makeService({
      placements: new Map([
        [COMPETITION_BBL_ID, { first: 'sew', second: 'vor', third: 'nur' }],
      ]),
    });
    const options = defaultOptions({
      categoriesByBblId: new Map([[MATCH_BBL_ID, 'season_bronze']]),
    });

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      {
        competitionId: COMPETITION_DB_ID,
        overrides: [],
        tieBreaks: [{ matchId: MATCH_DB_ID, winnerTeamEraId: 503 }],
      },
      expect.anything(),
    );
  });

  it('keys the final and bronze tie-breaks to their own matches in one competition', async () => {
    const FINAL_BBL_ID = '1830';
    const BRONZE_BBL_ID = '1831';
    const FINAL_DB_ID = 11;
    const BRONZE_DB_ID = 12;
    const { service, mocks } = await makeService({
      matches: new Map([
        [COMPETITION_BBL_ID, [match(FINAL_BBL_ID), match(BRONZE_BBL_ID)]],
      ]),
      placements: new Map([
        [COMPETITION_BBL_ID, { first: 'sew', second: 'vor', third: 'nur' }],
      ]),
    });
    const options = defaultOptions({
      matchIdsByBblId: new Map([
        [FINAL_BBL_ID, FINAL_DB_ID],
        [BRONZE_BBL_ID, BRONZE_DB_ID],
      ]),
      categoriesByBblId: new Map([
        [FINAL_BBL_ID, 'season_final'],
        [BRONZE_BBL_ID, 'season_bronze'],
      ]),
    });

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      {
        competitionId: COMPETITION_DB_ID,
        overrides: [],
        tieBreaks: [
          { matchId: FINAL_DB_ID, winnerTeamEraId: 501 },
          { matchId: BRONZE_DB_ID, winnerTeamEraId: 503 },
        ],
      },
      expect.anything(),
    );
  });

  it('sends no tie-break for a normal match', async () => {
    const { service, mocks } = await makeService({
      placements: new Map([
        [COMPETITION_BBL_ID, { first: 'sew', second: 'vor', third: 'nur' }],
      ]),
    });
    const options = defaultOptions({
      categoriesByBblId: new Map([[MATCH_BBL_ID, 'normal']]),
    });

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ tieBreaks: [] }),
      expect.anything(),
    );
  });

  it('sends no tie-break when the competition has no trophy table', async () => {
    const { service, mocks } = await makeService({ placements: new Map() });
    const options = defaultOptions({
      categoriesByBblId: new Map([[MATCH_BBL_ID, 'cup_final']]),
    });

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ tieBreaks: [] }),
      expect.anything(),
    );
  });

  it('sends a configured override as an override, not a tie-break', async () => {
    const { service, mocks } = await makeService({
      overrides: new Map([[MATCH_BBL_ID, 'vor']]),
    });
    const options = defaultOptions();

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: [{ matchId: MATCH_DB_ID, winnerTeamEraId: 502 }],
        tieBreaks: [],
      }),
      expect.anything(),
    );
  });

  it('sends a "draw" override as a null winner', async () => {
    const { service, mocks } = await makeService({
      overrides: new Map([[MATCH_BBL_ID, null]]),
    });
    const options = defaultOptions();

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: [{ matchId: MATCH_DB_ID, winnerTeamEraId: null }],
      }),
      expect.anything(),
    );
  });

  it('records an error when a Team trophy tie-break names an unknown team code', async () => {
    const { service, mocks } = await makeService({
      placements: new Map([[COMPETITION_BBL_ID, { first: 'zzz' }]]),
    });
    useRealResult(mocks.importResults);
    const options = defaultOptions({
      categoriesByBblId: new Map([[MATCH_BBL_ID, 'cup_final']]),
    });

    const { result } = await service.importMatchOutcomes(options);

    expect(result.errors[0].message).toContain(
      'could not resolve team code "zzz"',
    );
  });

  it('records an error when an override names an unknown team code', async () => {
    const { service, mocks } = await makeService({
      overrides: new Map([[MATCH_BBL_ID, 'zzz']]),
    });
    useRealResult(mocks.importResults);
    const options = defaultOptions();

    const { result } = await service.importMatchOutcomes(options);

    expect(result.errors[0].message).toContain(
      'could not resolve team code "zzz"',
    );
  });

  it("applies a merged pair's override keyed on either source id", async () => {
    const PARTNER_BBL_ID = '1831';
    const merges: MatchMergeResolution = {
      primaryBblIdByBblId: new Map([
        [MATCH_BBL_ID, MATCH_BBL_ID],
        [PARTNER_BBL_ID, MATCH_BBL_ID],
      ]),
      partnerBblId: (bblId) =>
        bblId === MATCH_BBL_ID
          ? PARTNER_BBL_ID
          : bblId === PARTNER_BBL_ID
            ? MATCH_BBL_ID
            : undefined,
      isPrimary: (bblId) => bblId === MATCH_BBL_ID,
      isSecondary: (bblId) => bblId === PARTNER_BBL_ID,
      effectivePlayedAt: (_bblId, rawDate) => rawDate,
    };
    const { service, mocks } = await makeService({
      matches: new Map([
        [COMPETITION_BBL_ID, [match(MATCH_BBL_ID), match(PARTNER_BBL_ID)]],
      ]),
      overrides: new Map([[PARTNER_BBL_ID, 'vor']]),
      merges,
    });
    const options = defaultOptions();

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: [{ matchId: MATCH_DB_ID, winnerTeamEraId: 502 }],
      }),
      expect.anything(),
    );
  });

  it('sends each merged pair only once', async () => {
    const FIRST_BBL_ID = '1061';
    const SECOND_BBL_ID = '1062';
    const merges: MatchMergeResolution = {
      primaryBblIdByBblId: new Map([
        [FIRST_BBL_ID, FIRST_BBL_ID],
        [SECOND_BBL_ID, FIRST_BBL_ID],
      ]),
      partnerBblId: (bblId) =>
        bblId === FIRST_BBL_ID
          ? SECOND_BBL_ID
          : bblId === SECOND_BBL_ID
            ? FIRST_BBL_ID
            : undefined,
      isPrimary: (bblId) => bblId === FIRST_BBL_ID,
      isSecondary: (bblId) => bblId === SECOND_BBL_ID,
      effectivePlayedAt: (_bblId, rawDate) => rawDate,
    };
    const { service, mocks } = await makeService({
      matches: new Map([
        [COMPETITION_BBL_ID, [match(FIRST_BBL_ID), match(SECOND_BBL_ID)]],
      ]),
      merges,
    });
    const options = defaultOptions({
      matchIdsByBblId: new Map([[FIRST_BBL_ID, MATCH_DB_ID]]),
      categoriesByBblId: new Map([[FIRST_BBL_ID, 'normal']]),
    });

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      {
        competitionId: COMPETITION_DB_ID,
        overrides: [],
        tieBreaks: [],
      },
      expect.anything(),
    );
  });

  it('records an error naming the BBL id for each unresolved match', async () => {
    const { service, mocks } = await makeService({
      outcomeResult: {
        competitionId: COMPETITION_DB_ID,
        resolvedMatchIds: [],
        unresolvedMatchIds: [MATCH_DB_ID],
      },
    });
    const options = defaultOptions();
    mocks.importResults.result.mockReturnValue({
      success: false,
      imported: 0,
      errors: [],
    });

    const { result } = await service.importMatchOutcomes(options);

    expect(resultArgs(mocks.importResults).errors[0].message).toContain(
      `Could not determine the outcome of match ${MATCH_BBL_ID}`,
    );
    expect(resultArgs(mocks.importResults).errors[0].message).toContain(
      'matches.resultOverrides',
    );
    expect(result.success).toBe(false);
  });

  it('points at the existing override, not "add one", when it named a non-participant and the match stayed unresolved', async () => {
    const { service, mocks } = await makeService({
      overrides: new Map([[MATCH_BBL_ID, 'vor']]),
      outcomeResult: {
        competitionId: COMPETITION_DB_ID,
        resolvedMatchIds: [],
        unresolvedMatchIds: [MATCH_DB_ID],
      },
    });
    const options = defaultOptions();
    mocks.importResults.result.mockReturnValue({
      success: false,
      imported: 0,
      errors: [],
    });

    await service.importMatchOutcomes(options);

    expect(resultArgs(mocks.importResults).errors[0].message).toContain(
      `Could not determine the outcome of match ${MATCH_BBL_ID}`,
    );
    expect(resultArgs(mocks.importResults).errors[0].message).not.toContain(
      'Add a matches.resultOverrides entry',
    );
    expect(resultArgs(mocks.importResults).errors[0].message).toContain(
      'not one of the',
    );
  });

  it('counts every resolved match as imported', async () => {
    const { service, mocks } = await makeService({
      outcomeResult: {
        competitionId: COMPETITION_DB_ID,
        resolvedMatchIds: [MATCH_DB_ID, 12],
        unresolvedMatchIds: [],
      },
    });
    const options = defaultOptions();

    await service.importMatchOutcomes(options);

    expect(resultArgs(mocks.importResults).imported).toBe(2);
  });

  it('skips a competition that was not imported', async () => {
    const { service, mocks } = await makeService();
    const options = defaultOptions({ competitionsByBblId: new Map() });

    await service.importMatchOutcomes(options);

    expect(mocks.matchOutcomes.resolveOutcomes).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).errors).toHaveLength(1);
  });
});
