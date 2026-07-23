import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
} from '@blood-bowl-tracker/import';
import { NameExternalIdService } from '@blood-bowl-tracker/import';
import {
  MatchEventParserService,
  MatchParserService,
  SecretObjectiveService,
  TournamentParserService,
  WeatherTypeService,
} from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile, TpSourceReader } from '../source/tp-source-reader';
import { TpCompetitionsImportService } from './tp-competitions-import.service';

interface MakeServiceOptions {
  files: () => AsyncIterable<TpSourceFile>;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertCompetitionResult: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  files,
  bootstrap,
  upsertCompetitionResult,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpCompetitionsImportService(
    {
      files,
      isBaseTournamentFile: (filename: string) =>
        /^tournament_[^_]+\.json$/.test(filename),
    } as unknown as TpSourceReader,
    new TournamentParserService(),
    new MatchParserService(
      new MatchEventParserService(
        new SecretObjectiveService(),
        new WeatherTypeService(),
      ),
    ),
    { upsertCompetitionResult } as unknown as CompetitionsImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
    new NameExternalIdService(),
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
  round?: number;
  roundName?: string;
}

function matchFile({
  era,
  competition,
  scheduledDate,
  matchId = 1,
  round = 1,
  roundName = 'ROUND',
}: MatchFileOptions): TpSourceFile {
  return {
    era,
    competition,
    type: 'match',
    filename: `match_${matchId}.json`,
    content: {
      matchId,
      scheduledDate,
      createdInstant: '2021-01-01T00:00:00Z',
      round,
      group: { phase: { roundName } },
      inscriptionLocal: { roster: { id: 1, lineUps: [] } },
      inscriptionVisitor: { roster: { id: 2, lineUps: [] } },
    },
  };
}

const eraIdsByName = new Map<string, number>([['Fourth era', 600]]);

describe('TpCompetitionsImportService', () => {
  it('imports a cup (short span) and a season (long span) with correct type and eraId', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
      upsertCompetitionResult,
    });

    const { result, competitionIdsByTpId, matchesByCompetitionId } =
      await service.importCompetitions(eraIdsByName);

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    expect(result.imported).toBe(2);
    // matchesByCompetitionId is keyed by DB competition id (42, 43), each
    // holding every TpMatch parsed for that group.
    expect([...matchesByCompetitionId.keys()].sort((a, b) => a - b)).toEqual([
      42, 43,
    ]);
    expect(matchesByCompetitionId.get(42)).toHaveLength(2);
    expect(matchesByCompetitionId.get(43)).toHaveLength(2);
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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(
      (upsertCompetitionResult.mock.calls[0][0] as UpsertCompetition).type,
    ).toBe('cup');
  });

  it('uses createdInstant when a match has a null scheduledDate', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertCompetitionResult = vi.fn();
    const service = makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }),
      ]),
      bootstrap,
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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
      upsertCompetitionResult,
    });

    const { result, matchesByCompetitionId } =
      await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('match_bad.json')),
    ).toBe(true);
    // Only the successfully parsed match is retained for this competition.
    expect(matchesByCompetitionId.get(42)).toHaveLength(1);
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['TP', 'Name'] },
        message: 'network timeout',
      },
    });
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
      bootstrap,
      upsertCompetitionResult,
    });

    const { result, matchesByCompetitionId } =
      await service.importCompetitions(eraIdsByName);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(matchesByCompetitionId.size).toBe(0);
  });

  it('records a diagnostic error but keeps competitions found before a scan failure', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
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

  it('skips a competition when upsertCompetitionResult resolves undefined (upsert failure)', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    // Simulates the shared import runner reporting a failure via `errors`
    // and resolving undefined instead of a competition.
    const upsertCompetitionResult = vi.fn().mockResolvedValueOnce(undefined);
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
      bootstrap,
      upsertCompetitionResult,
    });

    const { result, competitionIdsByTpId } =
      await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(0);
    expect(competitionIdsByTpId.has(111)).toBe(false);
    expect(upsertCompetitionResult).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-base tournament variant file, still importing using the base file', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
          type: 'tournament',
          filename: 'tournament_chaos-cup-8_coach-stats.json',
          content: { unrelated: 'variant content, should be ignored' },
        },
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T10:00:00Z',
          matchId: 1,
        }),
      ]),
      bootstrap,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
    expect(
      (upsertCompetitionResult.mock.calls[0][0] as UpsertCompetition).name,
    ).toBe('Chaos Cup 8');
  });

  it('re-runs idempotently, upserting the same competition with identical data', async () => {
    const makeRunService = () => {
      const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
        bootstrap,
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

  it('exposes parsed matches with constructed names keyed by competition DB id', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
          round: 3,
          roundName: 'ROUND',
        }),
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          scheduledDate: '2021-05-15T12:00:00Z',
          matchId: 2,
          round: 2,
          roundName: 'DAY',
        }),
      ]),
      bootstrap,
      upsertCompetitionResult,
    });

    const { matchesByCompetitionId } =
      await service.importCompetitions(eraIdsByName);

    expect(
      matchesByCompetitionId
        .get(42)
        ?.map((m) => m.name)
        .sort(),
    ).toEqual(['Day 2', 'Round 3']);
  });

  it('exposes competitionsByTpId with each competition upsert, era and competition directory', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
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
      bootstrap,
      upsertCompetitionResult,
    });

    const { competitionsByTpId } =
      await service.importCompetitions(eraIdsByName);

    const entry = competitionsByTpId.get(111);
    expect(entry?.era).toBe('Fourth era');
    expect(entry?.competition).toBe('chaos-cup-8');
    expect(entry?.upsert).toEqual({
      name: 'Chaos Cup 8',
      type: 'cup',
      eraId: 600,
      teamEraIds: [],
      externalIds: [
        { externalSystemId: 1, externalId: '111' },
        { externalSystemId: 2, externalId: 'Chaos Cup 8' },
      ],
    });
  });
});
