import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  MatchesImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { mockKeyOf } from '../shared/reference-lookup-mock.test-helpers';
import { BblMatchDetailReaderService } from './bbl-match-detail-reader.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { BblMatchesImportService } from './bbl-matches-import.service';
import { MatchCategoryClassifierService } from './match-category-classifier.service';
import { MatchCategoryConfigService } from './match-category-config.service';
import type { BblMatch } from './match-list-page-parser';
import type { MatchMergeResolution } from './match-merge.service';
import { MatchMergeService } from './match-merge.service';
import type { BblMatchDetails } from './match-teams-page-parser';

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

const detail = (bblId: string, name: string): BblMatchDetails => ({
  bblId,
  homeTeamId: 'a',
  awayTeamId: 'b',
  name,
});

/** The numeric id the mocked bootstrap assigns to the BBL external system. */
const BBL_SYSTEM_ID = 1;

/** A resolution with no merged pairs: every match imports independently. */
function noMergeResolution(): MatchMergeResolution {
  return {
    primaryBblIdByBblId: new Map(),
    partnerBblId: () => undefined,
    isPrimary: () => false,
    isSecondary: () => false,
    effectivePlayedAt: (_bblId, rawDate) => rawDate,
  };
}

interface Mocks {
  matchListReader: MockProxy<BblMatchListReaderService>;
  matchesImport: MockProxy<MatchesImportService>;
  matchMerge: MockProxy<MatchMergeService>;
  matchDetailReader: MockProxy<BblMatchDetailReaderService>;
  importResults: MockProxy<ImportResultService>;
  classifier: MockProxy<MatchCategoryClassifierService>;
  categoryConfig: MockProxy<MatchCategoryConfigService>;
  lookup: MockProxy<ReferenceLookupService>;
}

/**
 * Configures `lookup.lookupMap` to answer a fixed 'competition' resolution: a
 * db id for every entry in `competitionIdsByBblId`, keyed via the mocked
 * `keyOf` (whose made-up, non-production key format is only a correlation id
 * between the two stubs -- see `mockKeyOf`). This is a canned response, not a
 * re-derivation of ReferenceLookupService's own algorithm -- it ignores the
 * `refs` argument entirely, so a test asserting on the request the service
 * makes (e.g. "resolves every competition id in one batched call") is
 * exercising the service's own call, not an echo of it.
 */
function mockCompetitionLookup(
  lookup: MockProxy<ReferenceLookupService>,
  competitionIdsByBblId: Map<string, number>,
): void {
  lookup.lookupMap.mockImplementation((kind) => {
    if (kind !== 'competition') {
      return Promise.resolve(new Map<string, number>());
    }
    return Promise.resolve(
      new Map(
        [...competitionIdsByBblId].map(([bblId, id]) => [
          lookup.keyOf({ externalSystemId: BBL_SYSTEM_ID, externalId: bblId }),
          id,
        ]),
      ),
    );
  });
}

async function makeService(
  matchesById: Record<string, BblMatch[]>,
  detailsById: Record<string, BblMatchDetails>,
  competitionIdsByBblId: Map<string, number> = new Map(),
): Promise<{ service: BblMatchesImportService; mocks: Mocks }> {
  const matchListReader = mock<BblMatchListReaderService>();
  matchListReader.getMatchesByCompetitionId.mockResolvedValue(
    new Map(Object.entries(matchesById)),
  );

  const matchesImport = mock<MatchesImportService>();

  const matchMerge = mock<MatchMergeService>();
  matchMerge.resolve.mockResolvedValue(noMergeResolution());

  const matchDetailReader = mock<BblMatchDetailReaderService>();
  matchDetailReader.getMatchTeamsByBblId.mockResolvedValue(
    new Map(Object.entries(detailsById)),
  );

  const importResults = mock<ImportResultService>();
  // `error` is a pure identity field copy with no branching or formatting, so
  // there is no algorithm here that can drift out of sync with the real
  // ImportResultService — exempt from the canned-response rule.
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const classifier = mock<MatchCategoryClassifierService>();
  classifier.classify.mockReturnValue('normal');

  const categoryConfig = mock<MatchCategoryConfigService>();
  categoryConfig.getCategoryOverrides.mockReturnValue(new Map());

  const lookup = mock<ReferenceLookupService>();
  mockKeyOf(lookup);
  mockCompetitionLookup(lookup, competitionIdsByBblId);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchesImportService,
      { provide: BblMatchListReaderService, useValue: matchListReader },
      { provide: MatchesImportService, useValue: matchesImport },
      { provide: MatchMergeService, useValue: matchMerge },
      { provide: BblMatchDetailReaderService, useValue: matchDetailReader },
      { provide: ImportResultService, useValue: importResults },
      { provide: MatchCategoryClassifierService, useValue: classifier },
      { provide: MatchCategoryConfigService, useValue: categoryConfig },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblMatchesImportService),
    mocks: {
      matchListReader,
      matchesImport,
      matchMerge,
      matchDetailReader,
      importResults,
      classifier,
      categoryConfig,
      lookup,
    },
  };
}

const match: BblMatch = {
  bblId: '89',
  date: new Date(Date.UTC(2021, 8, 25)),
};

const competition: UpsertCompetition = {
  name: 'Major Season 3',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [{ externalSystemId: 1, externalId: '3' }],
};

describe('BblMatchesImportService', () => {
  it('upserts each match and returns its DB id keyed by BBL match id', async () => {
    const { service, mocks } = await makeService(
      { '3': [match] },
      { '89': detail('89', 'Match 3') },
      new Map([['3', 42]]),
    );
    mocks.matchesImport.upsertMatchResult.mockResolvedValue({ id: 7 });

    const { matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
    );

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(matchIdsByBblId.get('89')).toBe(7);
    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledWith(
      {
        competitionId: 42,
        playedAt: new Date(Date.UTC(2021, 8, 25)),
        name: 'Match 3',
        category: 'normal',
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
        teamEraIds: [],
      },
      expect.any(Array),
    );
  });

  it('resolves every competition id in one batched call', async () => {
    const { service, mocks } = await makeService(
      { '5': [match] },
      { '89': detail('89', 'Match 5') },
      new Map([['5', 42]]),
    );
    const competitionsByBblId = new Map([
      [
        '5',
        {
          ...competition,
          externalIds: [{ externalSystemId: BBL_SYSTEM_ID, externalId: '5' }],
        },
      ],
    ]);

    await service.importMatches(competitionsByBblId);

    expect(mocks.lookup.lookupMap).toHaveBeenCalledTimes(1);
    expect(mocks.lookup.lookupMap).toHaveBeenCalledWith('competition', [
      { externalSystemId: BBL_SYSTEM_ID, externalId: '5' },
    ]);
  });

  it('records an error and skips a competition absent from the id map', async () => {
    const { service, mocks } = await makeService(
      { '3': [match, { ...match, bblId: '90' }] },
      {},
    );

    const { matchIdsByBblId } = await service.importMatches(new Map());

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.matchesImport.upsertMatchResult).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(matchIdsByBblId.size).toBe(0);
  });

  it('does not count or map a match whose upsert reports failure', async () => {
    const { service, mocks } = await makeService(
      { '3': [match] },
      { '89': detail('89', 'Match 3') },
      new Map([['3', 42]]),
    );
    mocks.matchesImport.upsertMatchResult.mockResolvedValue(undefined);

    const { matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
    );

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(matchIdsByBblId.size).toBe(0);
    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledTimes(1);
  });

  it('merges a configured pair into one upsert carrying both external ids and the canonical playedAt', async () => {
    const primary: BblMatch = {
      bblId: '1061',
      date: new Date(Date.UTC(2016, 8, 25)),
    };
    const secondary: BblMatch = {
      bblId: '1062',
      date: new Date(Date.UTC(2016, 8, 24)),
    };
    const { service, mocks } = await makeService(
      { '32': [primary, secondary] },
      { '1061': detail('1061', 'Bierhallentodball') },
      new Map([['32', 99]]),
    );
    mocks.matchesImport.upsertMatchResult.mockResolvedValue({ id: 500 });
    mocks.matchMerge.resolve.mockResolvedValue({
      primaryBblIdByBblId: new Map([
        ['1061', '1061'],
        ['1062', '1061'],
      ]),
      partnerBblId: (bblId) =>
        bblId === '1061' ? '1062' : bblId === '1062' ? '1061' : undefined,
      isPrimary: (bblId) => bblId === '1061',
      isSecondary: (bblId) => bblId === '1062',
      effectivePlayedAt: (bblId, rawDate) =>
        bblId === '1061' || bblId === '1062' ? secondary.date : rawDate,
    });

    const { matchIdsByBblId } = await service.importMatches(
      new Map([
        [
          '32',
          {
            ...competition,
            externalIds: [{ externalSystemId: 1, externalId: '32' }],
          },
        ],
      ]),
    );

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledTimes(1);
    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledWith(
      {
        competitionId: 99,
        playedAt: new Date(Date.UTC(2016, 8, 24)),
        name: 'Bierhallentodball',
        category: 'normal',
        externalIds: [
          { externalSystemId: 1, externalId: '1061' },
          { externalSystemId: 1, externalId: '1062' },
        ],
        teamEraIds: [],
      },
      expect.any(Array),
    );
    expect(matchIdsByBblId.get('1061')).toBe(500);
    expect(matchIdsByBblId.get('1062')).toBe(500);
  });

  it('imports both members of an unresolved pair independently, with a recorded error', async () => {
    const a: BblMatch = {
      bblId: '1061',
      date: new Date(Date.UTC(2016, 8, 25)),
    };
    const b: BblMatch = { bblId: '1062', date: new Date(Date.UTC(2017, 9, 8)) };
    // The two ids are in different competitions, so the pair does not resolve.
    const { service, mocks } = await makeService(
      { '32': [a], '40': [b] },
      { '1061': detail('1061', 'Match A'), '1062': detail('1062', 'Match B') },
      new Map([
        ['32', 99],
        ['40', 88],
      ]),
    );
    mocks.matchesImport.upsertMatchResult
      .mockResolvedValueOnce({ id: 500 })
      .mockResolvedValueOnce({ id: 600 });
    mocks.matchMerge.resolve.mockImplementation((errors) => {
      errors.push({
        item: { matches: ['1061', '1062'] },
        message:
          "Skipping match merge for pair [1061, 1062]: both match ids must appear in the same competition's match list, but they do not. Importing them as independent matches.",
      });
      return Promise.resolve(noMergeResolution());
    });

    const { matchIdsByBblId } = await service.importMatches(
      new Map([
        [
          '32',
          {
            ...competition,
            externalIds: [{ externalSystemId: 1, externalId: '32' }],
          },
        ],
        [
          '40',
          {
            ...competition,
            externalIds: [{ externalSystemId: 1, externalId: '40' }],
          },
        ],
      ]),
    );

    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledTimes(2);
    expect(matchIdsByBblId.get('1061')).toBe(500);
    expect(matchIdsByBblId.get('1062')).toBe(600);
    // The unresolved-pair error is recorded by MatchMergeService.resolve().
    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('1061'),
      ),
    ).toBe(true);
  });

  it('records an error and skips a match with no detail-page entry', async () => {
    const { service, mocks } = await makeService(
      { '3': [match] },
      {},
      new Map([['3', 42]]),
    );

    const { matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
    );

    expect(mocks.matchesImport.upsertMatchResult).not.toHaveBeenCalled();
    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(matchIdsByBblId.size).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService({ '3': [match] }, {});

    const { result } = await service.importMatches(new Map());

    expect(result).toBe(CANNED_RESULT);
  });

  describe('category resolution', () => {
    const cupMatch: BblMatch = {
      bblId: '1830',
      date: new Date(Date.UTC(2022, 5, 1)),
    };

    const cupCompetition: UpsertCompetition = {
      name: 'Cup Season 3',
      type: 'cup',
      eraId: 200,
      teamEraIds: [],
      externalIds: [{ externalSystemId: 1, externalId: '55' }],
    };

    let mocks: Mocks;
    let service: BblMatchesImportService;
    let competitionsByBblId: Map<string, UpsertCompetition>;

    beforeEach(async () => {
      ({ service, mocks } = await makeService(
        { '55': [cupMatch] },
        { '1830': detail('1830', 'Final') },
        new Map([['55', 900]]),
      ));
      mocks.matchesImport.upsertMatchResult.mockResolvedValue({ id: 700 });
      mocks.matchMerge.resolve.mockResolvedValue({
        primaryBblIdByBblId: new Map([['1830', '1830']]),
        partnerBblId: (bblId) => (bblId === '1830' ? '1831' : undefined),
        isPrimary: (bblId) => bblId === '1830',
        isSecondary: () => false,
        effectivePlayedAt: (_bblId, rawDate) => rawDate,
      });
      // Reflects the real ImportResultService.result() shape (a pure field
      // copy, not branching logic to guard against drift) so these tests can
      // assert on the returned result's errors directly, rather than only on
      // the args recorded via resultArgs().
      mocks.importResults.result.mockImplementation((args) => ({
        success: args.errors.length === 0,
        imported: args.imported,
        errors: args.errors,
      }));
      competitionsByBblId = new Map([['55', cupCompetition]]);
    });

    it('sends the classifier-derived category on the upsert', async () => {
      mocks.classifier.classify.mockReturnValue('season_final');
      await service.importMatches(competitionsByBblId);
      expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'season_final' }),
        expect.anything(),
      );
    });

    it('passes the match name and the competition type to the classifier', async () => {
      await service.importMatches(competitionsByBblId);
      expect(mocks.classifier.classify).toHaveBeenCalledWith({
        bblId: '1830',
        name: 'Final',
        competitionType: 'cup',
      });
    });

    it('prefers a configured override over the classifier', async () => {
      mocks.categoryConfig.getCategoryOverrides.mockReturnValue(
        new Map([['1830', 'cup_final']]),
      );
      mocks.classifier.classify.mockReturnValue('normal');
      await service.importMatches(competitionsByBblId);
      expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'cup_final' }),
        expect.anything(),
      );
      expect(mocks.classifier.classify).not.toHaveBeenCalled();
    });

    it('uses a merge partner’s override when the primary has none', async () => {
      // merges.partnerBblId returns '1831' for '1830'
      mocks.categoryConfig.getCategoryOverrides.mockReturnValue(
        new Map([['1831', 'cup_final']]),
      );
      await service.importMatches(competitionsByBblId);
      expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'cup_final' }),
        expect.anything(),
      );
    });

    it('records an error and skips the match when the classifier throws', async () => {
      mocks.classifier.classify.mockImplementation(() => {
        throw new Error('looks like a knock-out stage');
      });
      const { result } = await service.importMatches(competitionsByBblId);
      expect(mocks.matchesImport.upsertMatchResult).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
    });

    it('records an error and skips the match when the competition has no type', async () => {
      // competitionsByBblId entry built without `type`
      const { type: _type, ...withoutType } = cupCompetition;
      competitionsByBblId = new Map([['55', withoutType]]);
      const { result } = await service.importMatches(competitionsByBblId);
      expect(mocks.matchesImport.upsertMatchResult).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
    });

    it('reads the override list once per import run, not once per match', async () => {
      await service.importMatches(competitionsByBblId);
      expect(mocks.categoryConfig.getCategoryOverrides).toHaveBeenCalledTimes(
        1,
      );
    });

    it('reports each imported match its resolved category', async () => {
      const { categoriesByBblId } =
        await service.importMatches(competitionsByBblId);
      expect(categoriesByBblId.get('1830')).toBe('normal');
    });
  });

  it("reports a merged pair's category under both source ids", async () => {
    const primary: BblMatch = {
      bblId: '1061',
      date: new Date(Date.UTC(2016, 8, 25)),
    };
    const secondary: BblMatch = {
      bblId: '1062',
      date: new Date(Date.UTC(2016, 8, 24)),
    };
    const { service, mocks } = await makeService(
      { '32': [primary, secondary] },
      { '1061': detail('1061', 'Bierhallentodball') },
      new Map([['32', 99]]),
    );
    mocks.matchesImport.upsertMatchResult.mockResolvedValue({ id: 500 });
    mocks.matchMerge.resolve.mockResolvedValue({
      primaryBblIdByBblId: new Map([
        ['1061', '1061'],
        ['1062', '1061'],
      ]),
      partnerBblId: (bblId) =>
        bblId === '1061' ? '1062' : bblId === '1062' ? '1061' : undefined,
      isPrimary: (bblId) => bblId === '1061',
      isSecondary: (bblId) => bblId === '1062',
      effectivePlayedAt: (bblId, rawDate) =>
        bblId === '1061' || bblId === '1062' ? secondary.date : rawDate,
    });
    mocks.categoryConfig.getCategoryOverrides.mockReturnValue(
      new Map([['1061', 'cup_final']]),
    );

    const { categoriesByBblId } = await service.importMatches(
      new Map([
        [
          '32',
          {
            ...competition,
            externalIds: [{ externalSystemId: 1, externalId: '32' }],
          },
        ],
      ]),
    );

    expect(categoriesByBblId.get('1061')).toBe('cup_final');
    expect(categoriesByBblId.get('1062')).toBe('cup_final');
  });
});
