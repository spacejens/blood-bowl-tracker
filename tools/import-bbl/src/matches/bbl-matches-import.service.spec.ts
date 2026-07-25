import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BblMatchDetailReaderService } from './bbl-match-detail-reader.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { BblMatchesImportService } from './bbl-matches-import.service';
import type { BblMatch } from './match-list-page-parser';
import type { MatchMergeResolution } from './match-merge.service';
import { MatchMergeService } from './match-merge.service';
import type { BblMatchDetails } from './match-teams-page-parser';

const detail = (bblId: string, name: string): BblMatchDetails => ({
  bblId,
  homeTeamId: 'a',
  awayTeamId: 'b',
  name,
});

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
}

async function makeService(
  matchesById: Record<string, BblMatch[]>,
  detailsById: Record<string, BblMatchDetails>,
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
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchesImportService,
      { provide: BblMatchListReaderService, useValue: matchListReader },
      { provide: MatchesImportService, useValue: matchesImport },
      { provide: MatchMergeService, useValue: matchMerge },
      { provide: BblMatchDetailReaderService, useValue: matchDetailReader },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblMatchesImportService),
    mocks: { matchListReader, matchesImport, matchMerge, matchDetailReader },
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
    );
    mocks.matchesImport.upsertMatchResult.mockResolvedValue({ id: 7 });

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(matchIdsByBblId.get('89')).toBe(7);
    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledWith(
      {
        competitionId: 42,
        playedAt: new Date(Date.UTC(2021, 8, 25)),
        name: 'Match 3',
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
        teamEraIds: [],
      },
      expect.any(Array),
    );
  });

  it('records an error and skips a competition absent from the id map', async () => {
    const { service, mocks } = await makeService(
      { '3': [match, { ...match, bblId: '90' }] },
      {},
    );

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map(),
      new Map(),
    );

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(mocks.matchesImport.upsertMatchResult).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(matchIdsByBblId.size).toBe(0);
  });

  it('does not count or map a match whose upsert reports failure', async () => {
    const { service, mocks } = await makeService(
      { '3': [match] },
      { '89': detail('89', 'Match 3') },
    );
    mocks.matchesImport.upsertMatchResult.mockResolvedValue(undefined);

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(result.imported).toBe(0);
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

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map([
        [
          '32',
          {
            ...competition,
            externalIds: [{ externalSystemId: 1, externalId: '32' }],
          },
        ],
      ]),
      new Map([['32', 99]]),
    );

    expect(result.imported).toBe(1);
    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledTimes(1);
    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledWith(
      {
        competitionId: 99,
        playedAt: new Date(Date.UTC(2016, 8, 24)),
        name: 'Bierhallentodball',
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

    const { result, matchIdsByBblId } = await service.importMatches(
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
      new Map([
        ['32', 99],
        ['40', 88],
      ]),
    );

    expect(mocks.matchesImport.upsertMatchResult).toHaveBeenCalledTimes(2);
    expect(matchIdsByBblId.get('1061')).toBe(500);
    expect(matchIdsByBblId.get('1062')).toBe(600);
    // The unresolved-pair error is recorded by MatchMergeService.resolve().
    expect(result.errors.some((e) => e.message.includes('1061'))).toBe(true);
  });

  it('records an error and skips a match with no detail-page entry', async () => {
    const { service, mocks } = await makeService({ '3': [match] }, {});

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(mocks.matchesImport.upsertMatchResult).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(matchIdsByBblId.size).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});
