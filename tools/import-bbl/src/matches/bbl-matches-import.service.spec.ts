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
  it('upserts each match with its competitionId, playedAt and BBL external id', async () => {
    const upsertMatch = vi.fn().mockResolvedValue(true);
    const service = new BblMatchesImportService(makeReader({ '3': [match] }), {
      upsertMatch,
    } as unknown as MatchesImportService);

    const { result } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(result.imported).toBe(1);
    expect(upsertMatch).toHaveBeenCalledWith(
      {
        competitionId: 42,
        playedAt: new Date(Date.UTC(2021, 8, 25)),
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
      },
      expect.any(Array),
    );
  });

  it('records an error and skips a competition absent from the id map', async () => {
    const upsertMatch = vi.fn();
    const service = new BblMatchesImportService(
      makeReader({ '3': [match, { ...match, bblId: '90' }] }),
      {
        upsertMatch,
      } as unknown as MatchesImportService,
    );

    const { result } = await service.importMatches(new Map(), new Map());

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(upsertMatch).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
  });

  it('does not count a match whose upsert reports failure', async () => {
    const upsertMatch = vi.fn().mockResolvedValue(false);
    const service = new BblMatchesImportService(makeReader({ '3': [match] }), {
      upsertMatch,
    } as unknown as MatchesImportService);

    const { result } = await service.importMatches(
      new Map([['3', competition]]),
      new Map([['3', 42]]),
    );

    expect(result.imported).toBe(0);
    expect(upsertMatch).toHaveBeenCalledTimes(1);
  });
});
