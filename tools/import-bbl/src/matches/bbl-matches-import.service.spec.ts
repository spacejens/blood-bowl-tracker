import type {
  MatchesImportService,
  UpsertCompetitionData,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { BblMatchesImportService } from './bbl-matches-import.service';
import type { BblMatch } from './match-list-page-parser';

function makeReader(matchesById: Record<string, BblMatch[]>) {
  const reader = new BblMatchListReaderService({} as never, {} as never);
  vi.spyOn(reader, 'getMatchesByCompetitionId').mockResolvedValue(
    new Map(Object.entries(matchesById)),
  );
  return reader;
}

const match: BblMatch = {
  bblId: '89',
  date: new Date(Date.UTC(2021, 8, 25)),
};

const competition: UpsertCompetitionData = {
  name: 'Major Season 3',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [{ externalSystemId: 1, externalId: '3' }],
};

describe('BblMatchesImportService', () => {
  it('upserts each match and returns its DB id keyed by BBL match id', async () => {
    const upsertMatchResult = vi.fn().mockResolvedValue({ id: 7 });
    const service = new BblMatchesImportService(makeReader({ '3': [match] }), {
      upsertMatchResult,
    } as unknown as MatchesImportService);

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
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
      },
      expect.any(Array),
    );
  });

  it('records an error and skips a competition absent from the id map', async () => {
    const upsertMatchResult = vi.fn();
    const service = new BblMatchesImportService(
      makeReader({ '3': [match, { ...match, bblId: '90' }] }),
      {
        upsertMatchResult,
      } as unknown as MatchesImportService,
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
    const upsertMatchResult = vi.fn().mockResolvedValue(undefined);
    const service = new BblMatchesImportService(makeReader({ '3': [match] }), {
      upsertMatchResult,
    } as unknown as MatchesImportService);

    const { result, matchIdsByBblId } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(result.imported).toBe(0);
    expect(matchIdsByBblId.size).toBe(0);
    expect(upsertMatchResult).toHaveBeenCalledTimes(1);
  });
});
