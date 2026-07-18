import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { MatchesImportService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import { BblMatchDetailReaderService } from './bbl-match-detail-reader.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { BblMatchesImportService } from './bbl-matches-import.service';
import type { BblMatch } from './match-list-page-parser';
import { MatchMergeService } from './match-merge.service';
import type { MatchMergeConfigService } from './match-merge-config.service';
import type { BblMatchDetails } from './match-teams-page-parser';

function makeReader(matchesById: Record<string, BblMatch[]>) {
  const reader = new BblMatchListReaderService({} as never, {} as never);
  vi.spyOn(reader, 'getMatchesByCompetitionId').mockResolvedValue(
    new Map(Object.entries(matchesById)),
  );
  return reader;
}

function makeDetailReader(
  detailsById: Record<string, BblMatchDetails>,
): BblMatchDetailReaderService {
  return {
    getMatchTeamsByBblId: vi
      .fn()
      .mockResolvedValue(new Map(Object.entries(detailsById))),
  } as unknown as BblMatchDetailReaderService;
}

const detail = (bblId: string, name: string): BblMatchDetails => ({
  bblId,
  homeTeamId: 'a',
  awayTeamId: 'b',
  name,
});

function makeMergeService(
  reader: BblMatchListReaderService,
  merges: [string, string][],
): MatchMergeService {
  const mergeConfig = { getMerges: () => merges } as MatchMergeConfigService;
  return new MatchMergeService(reader, mergeConfig);
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
    const reader = makeReader({ '3': [match] });
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 7 });
    const service = new BblMatchesImportService(
      reader,
      { upsertMatchResult } as unknown as MatchesImportService,
      makeMergeService(reader, []),
      makeDetailReader({ '89': detail('89', 'Match 3') }),
    );

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(matchIdsByBblId.get('89')).toBe(7);
    expect(upsertMatchResult).toHaveBeenCalledWith(
      {
        competitionId: 42,
        playedAt: new Date(Date.UTC(2021, 8, 25)),
        name: 'Match 3',
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
      },
      expect.any(Array),
    );
  });

  it('records an error and skips a competition absent from the id map', async () => {
    const reader = makeReader({ '3': [match, { ...match, bblId: '90' }] });
    const upsertMatchResult = vi.fn();
    const service = new BblMatchesImportService(
      reader,
      { upsertMatchResult } as unknown as MatchesImportService,
      makeMergeService(reader, []),
      makeDetailReader({}),
    );

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map(),
      new Map(),
    );

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(upsertMatchResult).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(matchIdsByBblId.size).toBe(0);
  });

  it('does not count or map a match whose upsert reports failure', async () => {
    const reader = makeReader({ '3': [match] });
    const upsertMatchResult = vi.fn().mockResolvedValue(undefined);
    const service = new BblMatchesImportService(
      reader,
      { upsertMatchResult } as unknown as MatchesImportService,
      makeMergeService(reader, []),
      makeDetailReader({ '89': detail('89', 'Match 3') }),
    );

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(result.imported).toBe(0);
    expect(matchIdsByBblId.size).toBe(0);
    expect(upsertMatchResult).toHaveBeenCalledTimes(1);
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
    const reader = makeReader({ '32': [primary, secondary] });
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 500 });
    const service = new BblMatchesImportService(
      reader,
      { upsertMatchResult } as unknown as MatchesImportService,
      makeMergeService(reader, [['1061', '1062']]),
      makeDetailReader({ '1061': detail('1061', 'Bierhallentodball') }),
    );

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
    expect(upsertMatchResult).toHaveBeenCalledTimes(1);
    expect(upsertMatchResult).toHaveBeenCalledWith(
      {
        competitionId: 99,
        playedAt: new Date(Date.UTC(2016, 8, 24)),
        name: 'Bierhallentodball',
        externalIds: [
          { externalSystemId: 1, externalId: '1061' },
          { externalSystemId: 1, externalId: '1062' },
        ],
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
    const reader = makeReader({ '32': [a], '40': [b] });
    const upsertMatchResult = vi
      .fn()
      .mockResolvedValueOnce({ id: 500 })
      .mockResolvedValueOnce({ id: 600 });
    const service = new BblMatchesImportService(
      reader,
      { upsertMatchResult } as unknown as MatchesImportService,
      makeMergeService(reader, [['1061', '1062']]),
      makeDetailReader({
        '1061': detail('1061', 'Match A'),
        '1062': detail('1062', 'Match B'),
      }),
    );

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

    expect(upsertMatchResult).toHaveBeenCalledTimes(2);
    expect(matchIdsByBblId.get('1061')).toBe(500);
    expect(matchIdsByBblId.get('1062')).toBe(600);
    // The unresolved-pair error is recorded by MatchMergeService.resolve().
    expect(result.errors.some((e) => e.message.includes('1061'))).toBe(true);
  });

  it('records an error and skips a match with no detail-page entry', async () => {
    const reader = makeReader({ '3': [match] });
    const upsertMatchResult = vi.fn();
    const service = new BblMatchesImportService(
      reader,
      { upsertMatchResult } as unknown as MatchesImportService,
      makeMergeService(reader, []),
      makeDetailReader({}),
    );

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(upsertMatchResult).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(matchIdsByBblId.size).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});
