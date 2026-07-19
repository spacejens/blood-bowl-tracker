import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type {
  CompetitionsImportService,
  ExternalSystemsImportService,
} from '@blood-bowl-tracker/import';
import {
  MatchParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile, TpSourceReader } from '../source/tp-source-reader';
import { TpCompetitionsImportService } from './tp-competitions-import.service';

interface MakeServiceOptions {
  files: () => AsyncIterable<TpSourceFile>;
  upsertExternalSystem: ReturnType<typeof vi.fn>;
  upsertCompetitionResult: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  files,
  upsertExternalSystem,
  upsertCompetitionResult,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpCompetitionsImportService(
    { files } as unknown as TpSourceReader,
    new TournamentParserService(),
    new MatchParserService(),
    { upsertCompetitionResult } as unknown as CompetitionsImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

function makeFiles(entries: TpSourceFile[]): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
  };
}

/** Models files() throwing partway through (e.g. a missing era directory). */
function makeFilesThatThrow(
  entries: TpSourceFile[],
  error: Error,
): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
    throw error;
  };
}

function tournamentFile(
  era: string,
  competition: string,
  tournament: { id: number; name: string; ruleSet?: number },
): TpSourceFile {
  return {
    era,
    competition,
    type: 'tournament',
    filename: `tournament_${competition}.json`,
    content: { ruleSet: 20, ...tournament },
  };
}

interface MatchFileOptions {
  era: string;
  competition: string;
  scheduledDate: string | null;
  matchId?: number;
}

function matchFile({
  era,
  competition,
  scheduledDate,
  matchId = 1,
}: MatchFileOptions): TpSourceFile {
  return {
    era,
    competition,
    type: 'match',
    filename: `match_${matchId}.json`,
    content: { matchId, scheduledDate, createdInstant: '2021-01-01T00:00:00Z' },
  };
}

const eraIdsByName = new Map<string, number>([['Fourth era', 600]]);

describe('TpCompetitionsImportService', () => {
  it('imports a cup (short span) and a season (long span) with correct type and eraId', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi
      .fn()
      .mockResolvedValueOnce({ id: 42 })
      .mockResolvedValueOnce({ id: 43 });
    const service = makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }),
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T10:00:00Z',
          matchId: 1,
        }),
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T18:00:00Z',
          matchId: 2,
        }),
        tournamentFile('Fourth era', 'sasong-26', {
          id: 222,
          name: 'Sasong 26',
        }),
        matchFile({
          era: 'Fourth era',
          competition: 'sasong-26',
          scheduledDate: '2021-01-10T10:00:00Z',
          matchId: 3,
        }),
        matchFile({
          era: 'Fourth era',
          competition: 'sasong-26',
          scheduledDate: '2021-08-10T10:00:00Z',
          matchId: 4,
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result, competitionIdsByTpId } =
      await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    expect(competitionIdsByTpId).toEqual(
      new Map([
        [111, 42],
        [222, 43],
      ]),
    );
    expect(upsertCompetitionResult).toHaveBeenNthCalledWith(
      1,
      {
        name: 'Chaos Cup 8',
        type: 'cup',
        eraId: 600,
        teamEraIds: [],
        externalIds: [
          { externalSystemId: 1, externalId: '111' },
          { externalSystemId: 2, externalId: 'Chaos Cup 8' },
        ],
      },
      expect.any(Array),
    );
    expect(upsertCompetitionResult).toHaveBeenNthCalledWith(
      2,
      {
        name: 'Sasong 26',
        type: 'season',
        eraId: 600,
        teamEraIds: [],
        externalIds: [
          { externalSystemId: 1, externalId: '222' },
          { externalSystemId: 2, externalId: 'Sasong 26' },
        ],
      },
      expect.any(Array),
    );
  });

  it('treats a single-day span as a cup (boundary: span 0)', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const service = makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }),
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T10:00:00Z',
          matchId: 1,
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(
      (upsertCompetitionResult.mock.calls[0][0] as UpsertCompetition).type,
    ).toBe('cup');
  });

  it('uses createdInstant when a match has a null scheduledDate', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const service = makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }),
        // Null scheduledDate -> falls back to createdInstant 2021-01-01.
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: null,
          matchId: 1,
        }),
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-08-10T10:00:00Z',
          matchId: 2,
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    // 2021-01-01 to 2021-08-10 is a long span -> season.
    expect(
      (upsertCompetitionResult.mock.calls[0][0] as UpsertCompetition).type,
    ).toBe('season');
  });

  it('skips a competition with no dated matches, recording an error', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('no dated matches')),
    ).toBe(true);
  });

  it('skips a competition with no base tournament file, recording an error', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      files: makeFiles([
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T10:00:00Z',
          matchId: 1,
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      result.errors.some(
        (e) =>
          e.message.includes('chaos-cup-8') && e.message.includes('tournament'),
      ),
    ).toBe(true);
  });

  it('skips a competition whose base tournament file fails to parse', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      files: makeFiles([
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'tournament',
          filename: 'tournament_chaos-cup-8.json',
          content: { id: 111, ruleSet: 20 }, // missing name
        },
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T10:00:00Z',
          matchId: 1,
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      result.errors.some(
        (e) => e.message.includes('chaos-cup-8') && e.message.includes('name'),
      ),
    ).toBe(true);
  });

  it('skips a competition whose era has no known database id', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      files: makeFiles([
        tournamentFile('Unknown era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }),
        matchFile({
          era: 'Unknown era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T10:00:00Z',
          matchId: 1,
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      result.errors.some(
        (e) =>
          e.message.includes('Unknown era') &&
          e.message.includes('database id'),
      ),
    ).toBe(true);
  });

  it('records an error for an unparsable match file but still imports using the good ones', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const service = makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }),
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'match',
          filename: 'match_bad.json',
          content: { matchId: 9 }, // missing createdInstant
        },
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T10:00:00Z',
          matchId: 2,
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('match_bad.json')),
    ).toBe(true);
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(new Error('network timeout'));
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }),
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T10:00:00Z',
          matchId: 1,
        }),
      ]),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
  });

  it('records a diagnostic error but keeps competitions found before a scan failure', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const service = makeService({
      files: makeFilesThatThrow(
        [
          tournamentFile('Fourth era', 'chaos-cup-8', {
            id: 111,
            name: 'Chaos Cup 8',
          }),
          matchFile({
            era: 'Fourth era',
            competition: 'chaos-cup-8',
            scheduledDate: '2021-05-15T10:00:00Z',
            matchId: 1,
          }),
        ],
        new Error(
          'Era data directory not found: /data/fifth-era (configured for era "Fifth era").',
        ),
      ),
      upsertExternalSystem,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    // The competition collected before the throw is still imported.
    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) =>
        e.message.includes('Era data directory not found'),
      ),
    ).toBe(true);
  });

  it('re-runs idempotently, upserting the same competition with identical data', async () => {
    const makeRunService = () => {
      const upsertExternalSystem = vi
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);
      const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
      const service = makeService({
        files: makeFiles([
          tournamentFile('Fourth era', 'chaos-cup-8', {
            id: 111,
            name: 'Chaos Cup 8',
          }),
          matchFile({
            era: 'Fourth era',
            competition: 'chaos-cup-8',
            scheduledDate: '2021-05-15T10:00:00Z',
            matchId: 1,
          }),
        ]),
        upsertExternalSystem,
        upsertCompetitionResult,
      });
      return { service, upsertCompetitionResult };
    };

    const first = makeRunService();
    const firstResult = await first.service.importCompetitions(eraIdsByName);
    const second = makeRunService();
    const secondResult = await second.service.importCompetitions(eraIdsByName);

    expect(firstResult.result.imported).toBe(1);
    expect(secondResult.result.imported).toBe(1);
    expect(first.upsertCompetitionResult.mock.calls[0][0]).toEqual(
      second.upsertCompetitionResult.mock.calls[0][0],
    );
  });
});
