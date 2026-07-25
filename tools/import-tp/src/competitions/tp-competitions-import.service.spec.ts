import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
} from '@blood-bowl-tracker/import';
import type { TpMatch, TpTournament } from '@blood-bowl-tracker/parse-tp';
import {
  MatchParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile } from '../source/tp-source-reader';
import { TpSourceReader } from '../source/tp-source-reader';
import { TpCompetitionsImportService } from './tp-competitions-import.service';

interface MakeServiceOptions {
  files: () => AsyncIterable<TpSourceFile>;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertCompetitionResult: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

/**
 * The canned TpTournament the mocked TournamentParserService.parse returns.
 * The real Zod validation (including which fields are required and the
 * message it produces) is covered by
 * packages/parse-tp/src/tournament-parser.service.spec.ts; this spec only
 * needs parse() to succeed or fail on demand.
 */
const CANNED_TOURNAMENT: TpTournament = { id: 1, name: 'T', ruleSet: 20 };

/**
 * The canned TpMatch the mocked MatchParserService.parse returns. The real
 * Zod validation (and the nested MatchEventParserService/
 * MatchEventDecodersService chain) is covered by
 * packages/parse-tp/src/match-parser.service.spec.ts; this spec only needs
 * parse() to succeed or fail on demand.
 */
const CANNED_MATCH: TpMatch = {
  id: 1,
  playedDate: new Date('2021-09-25'),
  name: 'Round 1',
  homeTeamTpId: 1,
  awayTeamTpId: 2,
  matchEvents: [],
  homeRosterPlayers: [],
  awayRosterPlayers: [],
};

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged.
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

async function makeService({
  files,
  bootstrap,
  upsertCompetitionResult,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions): Promise<{
  service: TpCompetitionsImportService;
  importResults: MockProxy<ImportResultService>;
  tournamentParser: MockProxy<TournamentParserService>;
  matchParser: MockProxy<MatchParserService>;
}> {
  const sourceReader = mock<TpSourceReader>();
  sourceReader.files.mockImplementation(files);
  sourceReader.isBaseTournamentFile.mockImplementation((filename: string) =>
    /^tournament_[^_]+\.json$/.test(filename),
  );
  const tournamentParser = mock<TournamentParserService>();
  tournamentParser.parse.mockReturnValue(CANNED_TOURNAMENT);
  const matchParser = mock<MatchParserService>();
  matchParser.parse.mockReturnValue(CANNED_MATCH);
  const competitionsImport = mock<CompetitionsImportService>();
  competitionsImport.upsertCompetitionResult.mockImplementation(
    asProviderMethod(upsertCompetitionResult),
  );
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockImplementation(
    asProviderMethod(bootstrap),
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockImplementation(getTpSystemName);
  const importResults = mockImportResultService();
  // The shared helper's mockImportResultService() only provides the exempt
  // `error` identity mock; `result` is stubbed with a canned value here.
  // ImportResultService.result's own success derivation is covered by
  // packages/import/src/import-result.service.spec.ts.
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpCompetitionsImportService,
      { provide: TpSourceReader, useValue: sourceReader },
      { provide: TournamentParserService, useValue: tournamentParser },
      { provide: MatchParserService, useValue: matchParser },
      { provide: CompetitionsImportService, useValue: competitionsImport },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpCompetitionsImportService),
    importResults,
    tournamentParser,
    matchParser,
  };
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
): { file: TpSourceFile; tournament: TpTournament } {
  const parsed: TpTournament = { ruleSet: 20, ...tournament };
  return {
    file: {
      era,
      competition,
      type: 'tournament',
      filename: `tournament_${competition}.json`,
      content: parsed,
    },
    tournament: parsed,
  };
}

interface MatchFileOptions {
  era: string;
  competition: string;
  /**
   * Pre-resolved play date, as `MatchParserService.parse` would have
   * produced it (its own `scheduledDate`/`createdInstant`/
   * `scoreResume.startInstant` fallback is covered by its own dedicated spec,
   * not re-tested here — see
   * `packages/parse-tp/src/match-parser.service.spec.ts`).
   */
  playedDate: Date;
  matchId?: number;
  round?: number;
  roundName?: string;
}

function matchFile({
  era,
  competition,
  playedDate,
  matchId = 1,
  round = 1,
  roundName = 'ROUND',
}: MatchFileOptions): { file: TpSourceFile; match: TpMatch } {
  const titleCasedRoundName = `${roundName.charAt(0).toUpperCase()}${roundName.slice(1).toLowerCase()}`;
  const match: TpMatch = {
    id: matchId,
    playedDate,
    name: `${titleCasedRoundName} ${round}`,
    homeTeamTpId: 1,
    awayTeamTpId: 2,
    matchEvents: [],
    homeRosterPlayers: [],
    awayRosterPlayers: [],
  };
  return {
    file: {
      era,
      competition,
      type: 'match',
      filename: `match_${matchId}.json`,
      content: match,
    },
    match,
  };
}

const eraIdsByName = new Map<string, number>([['Fourth era', 600]]);

describe('TpCompetitionsImportService', () => {
  it('imports a cup (short span) and a season (long span) with correct type and eraId', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi
      .fn()
      .mockResolvedValueOnce({ id: 42 })
      .mockResolvedValueOnce({ id: 43 });
    const chaosTournament = tournamentFile('Fourth era', 'chaos-cup-8', {
      id: 111,
      name: 'Chaos Cup 8',
    });
    const chaosMatch1 = matchFile({
      era: 'Fourth era',
      competition: 'chaos-cup-8',
      playedDate: new Date('2021-05-15T10:00:00Z'),
      matchId: 1,
    });
    const chaosMatch2 = matchFile({
      era: 'Fourth era',
      competition: 'chaos-cup-8',
      playedDate: new Date('2021-05-15T18:00:00Z'),
      matchId: 2,
    });
    const sasongTournament = tournamentFile('Fourth era', 'sasong-26', {
      id: 222,
      name: 'Sasong 26',
    });
    const sasongMatch1 = matchFile({
      era: 'Fourth era',
      competition: 'sasong-26',
      playedDate: new Date('2021-01-10T10:00:00Z'),
      matchId: 3,
    });
    const sasongMatch2 = matchFile({
      era: 'Fourth era',
      competition: 'sasong-26',
      playedDate: new Date('2021-08-10T10:00:00Z'),
      matchId: 4,
    });
    const { service, importResults, tournamentParser, matchParser } =
      await makeService({
        files: makeFiles([
          chaosTournament.file,
          chaosMatch1.file,
          chaosMatch2.file,
          sasongTournament.file,
          sasongMatch1.file,
          sasongMatch2.file,
        ]),
        bootstrap,
        upsertCompetitionResult,
      });
    // parse() call order follows the file stream: tournamentParser.parse is
    // invoked in group-first-appearance order (chaos, then sasong);
    // matchParser.parse in the exact stream order of match files.
    tournamentParser.parse
      .mockReturnValueOnce(chaosTournament.tournament)
      .mockReturnValueOnce(sasongTournament.tournament);
    matchParser.parse
      .mockReturnValueOnce(chaosMatch1.match)
      .mockReturnValueOnce(chaosMatch2.match)
      .mockReturnValueOnce(sasongMatch1.match)
      .mockReturnValueOnce(sasongMatch2.match);

    const { competitionIdsByTpId, matchesByCompetitionId } =
      await service.importCompetitions(eraIdsByName);

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
    ]);
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(2);
    expect(errors).toHaveLength(0);
    // matchesByCompetitionId is keyed by DB competition id (42, 43), each
    // holding every TpMatch parsed for that group.
    expect([...matchesByCompetitionId.keys()].sort((a, b) => a - b)).toEqual([
      42, 43,
    ]);
    expect(matchesByCompetitionId.get(42)).toHaveLength(2);
    expect(matchesByCompetitionId.get(43)).toHaveLength(2);
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
        externalIds: [{ externalSystemId: 1, externalId: '111' }],
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
        externalIds: [{ externalSystemId: 1, externalId: '222' }],
      },
      expect.any(Array),
    );
  });

  it('treats a single-day span as a cup (boundary: span 0)', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const { service, importResults } = await makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }).file,
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 1,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });

    await service.importCompetitions(eraIdsByName);

    const { imported } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(
      (upsertCompetitionResult.mock.calls[0][0] as UpsertCompetition).type,
    ).toBe('cup');
  });

  it('classifies by the resolved playedDate span, spanning a fallback-resolved date', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    // Models a match whose playedDate was resolved via the createdInstant
    // fallback (MatchParserService's own concern, covered by its dedicated
    // spec) rather than scheduledDate.
    const match1 = matchFile({
      era: 'Fourth era',
      competition: 'chaos-cup-8',
      playedDate: new Date('2021-01-01T00:00:00Z'),
      matchId: 1,
    });
    const match2 = matchFile({
      era: 'Fourth era',
      competition: 'chaos-cup-8',
      playedDate: new Date('2021-08-10T10:00:00Z'),
      matchId: 2,
    });
    const { service, importResults, matchParser } = await makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }).file,
        match1.file,
        match2.file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });
    matchParser.parse
      .mockReturnValueOnce(match1.match)
      .mockReturnValueOnce(match2.match);

    await service.importCompetitions(eraIdsByName);

    const { imported } = resultArgs(importResults);
    expect(imported).toBe(1);
    // 2021-01-01 to 2021-08-10 is a long span -> season.
    expect(
      (upsertCompetitionResult.mock.calls[0][0] as UpsertCompetition).type,
    ).toBe('season');
  });

  it('skips a competition with no dated matches, recording an error', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn();
    const { service, importResults } = await makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('no dated matches'))).toBe(
      true,
    );
  });

  it('skips a competition with no base tournament file, recording an error', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn();
    const { service, importResults } = await makeService({
      files: makeFiles([
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 1,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      errors.some(
        (e) =>
          e.message.includes('chaos-cup-8') && e.message.includes('tournament'),
      ),
    ).toBe(true);
  });

  it('skips a competition whose base tournament file fails to parse', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn();
    const { service, importResults, tournamentParser } = await makeService({
      files: makeFiles([
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'tournament',
          filename: 'tournament_chaos-cup-8.json',
          content: { file: 'tournament_chaos-cup-8.json' },
        },
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 1,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });
    tournamentParser.parse.mockImplementationOnce(() => {
      throw new Error('Invalid TP tournament JSON: missing name');
    });

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      errors.some(
        (e) =>
          e.message.includes('chaos-cup-8') &&
          e.message.includes('missing name'),
      ),
    ).toBe(true);
  });

  it('skips a competition whose era has no known database id', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn();
    const { service, importResults } = await makeService({
      files: makeFiles([
        tournamentFile('Unknown era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }).file,
        matchFile({
          era: 'Unknown era',
          competition: 'chaos-cup-8',
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 1,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(
      errors.some(
        (e) =>
          e.message.includes('Unknown era') &&
          e.message.includes('database id'),
      ),
    ).toBe(true);
  });

  it('records an error for an unparsable match file but still imports using the good ones', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const { service, importResults, matchParser } = await makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }).file,
        {
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          type: 'match',
          filename: 'match_bad.json',
          content: { file: 'match_bad.json' },
        },
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 2,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });
    // First call (match_bad.json) fails; the second (matchId: 2) falls back
    // to makeService's CANNED_MATCH default.
    matchParser.parse.mockImplementationOnce(() => {
      throw new Error('Invalid TP match JSON: missing playedDate');
    });

    const { matchesByCompetitionId } =
      await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors.some((e) => e.message.includes('match_bad.json'))).toBe(true);
    // Only the successfully parsed match is retained for this competition.
    expect(matchesByCompetitionId.get(42)).toHaveLength(1);
  });

  it('records one error and imports nothing when external system bootstrap fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['TP'] },
        message: 'network timeout',
      },
    });
    const upsertCompetitionResult = vi.fn();
    const { service, importResults } = await makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }).file,
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 1,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });

    const { matchesByCompetitionId } =
      await service.importCompetitions(eraIdsByName);

    const { errors } = resultArgs(importResults);
    expect(errors).toHaveLength(1);
    expect(errors[0].item).toEqual({ externalSystems: ['TP'] });
    expect(upsertCompetitionResult).not.toHaveBeenCalled();
    expect(matchesByCompetitionId.size).toBe(0);
  });

  it('records a diagnostic error but keeps competitions found before a scan failure', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const { service, importResults } = await makeService({
      files: makeFilesThatThrow(
        [
          tournamentFile('Fourth era', 'chaos-cup-8', {
            id: 111,
            name: 'Chaos Cup 8',
          }).file,
          matchFile({
            era: 'Fourth era',
            competition: 'chaos-cup-8',
            playedDate: new Date('2021-05-15T10:00:00Z'),
            matchId: 1,
          }).file,
        ],
        new Error(
          'Era data directory not found: /data/fifth-era (configured for era "Fifth era").',
        ),
      ),
      bootstrap,
      upsertCompetitionResult,
    });

    await service.importCompetitions(eraIdsByName);

    // The competition collected before the throw is still imported.
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(
      errors.some((e) => e.message.includes('Era data directory not found')),
    ).toBe(true);
  });

  it('skips a competition when upsertCompetitionResult resolves undefined (upsert failure)', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    // Simulates the shared import runner reporting a failure via `errors`
    // and resolving undefined instead of a competition.
    const upsertCompetitionResult = vi.fn().mockResolvedValueOnce(undefined);
    const chaosTournament = tournamentFile('Fourth era', 'chaos-cup-8', {
      id: 111,
      name: 'Chaos Cup 8',
    });
    const { service, tournamentParser, importResults } = await makeService({
      files: makeFiles([
        chaosTournament.file,
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 1,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });
    tournamentParser.parse.mockReturnValueOnce(chaosTournament.tournament);

    const { competitionIdsByTpId } =
      await service.importCompetitions(eraIdsByName);

    expect(competitionIdsByTpId.has(111)).toBe(false);
    expect(upsertCompetitionResult).toHaveBeenCalledTimes(1);
    expect(resultArgs(importResults).imported).toBe(0);
  });

  it('ignores a non-base tournament variant file, still importing using the base file', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const chaosTournament = tournamentFile('Fourth era', 'chaos-cup-8', {
      id: 111,
      name: 'Chaos Cup 8',
    });
    const { service, importResults, tournamentParser } = await makeService({
      files: makeFiles([
        chaosTournament.file,
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
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 1,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });
    // Only the base file is ever passed to tournamentParser.parse — the
    // variant file is filtered out by isBaseTournamentFile before that.
    tournamentParser.parse.mockReturnValueOnce(chaosTournament.tournament);

    await service.importCompetitions(eraIdsByName);

    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(1);
    expect(errors).toHaveLength(0);
    expect(
      (upsertCompetitionResult.mock.calls[0][0] as UpsertCompetition).name,
    ).toBe('Chaos Cup 8');
  });

  it('re-runs idempotently, upserting the same competition with identical data', async () => {
    const makeRunService = async () => {
      const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
      const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
      const { service, importResults } = await makeService({
        files: makeFiles([
          tournamentFile('Fourth era', 'chaos-cup-8', {
            id: 111,
            name: 'Chaos Cup 8',
          }).file,
          matchFile({
            era: 'Fourth era',
            competition: 'chaos-cup-8',
            playedDate: new Date('2021-05-15T10:00:00Z'),
            matchId: 1,
          }).file,
        ]),
        bootstrap,
        upsertCompetitionResult,
      });
      return { service, importResults, upsertCompetitionResult };
    };

    const first = await makeRunService();
    await first.service.importCompetitions(eraIdsByName);
    const second = await makeRunService();
    await second.service.importCompetitions(eraIdsByName);

    expect(resultArgs(first.importResults).imported).toBe(1);
    expect(resultArgs(second.importResults).imported).toBe(1);
    expect(first.upsertCompetitionResult.mock.calls[0][0]).toEqual(
      second.upsertCompetitionResult.mock.calls[0][0],
    );
  });

  it('exposes parsed matches with constructed names keyed by competition DB id', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const match1 = matchFile({
      era: 'Fourth era',
      competition: 'chaos-cup-8',
      playedDate: new Date('2021-05-15T10:00:00Z'),
      matchId: 1,
      round: 3,
      roundName: 'ROUND',
    });
    const match2 = matchFile({
      era: 'Fourth era',
      competition: 'chaos-cup-8',
      playedDate: new Date('2021-05-15T12:00:00Z'),
      matchId: 2,
      round: 2,
      roundName: 'DAY',
    });
    const { service, matchParser } = await makeService({
      files: makeFiles([
        tournamentFile('Fourth era', 'chaos-cup-8', {
          id: 111,
          name: 'Chaos Cup 8',
        }).file,
        match1.file,
        match2.file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });
    matchParser.parse
      .mockReturnValueOnce(match1.match)
      .mockReturnValueOnce(match2.match);

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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const chaosTournament = tournamentFile('Fourth era', 'chaos-cup-8', {
      id: 111,
      name: 'Chaos Cup 8',
    });
    const { service, tournamentParser } = await makeService({
      files: makeFiles([
        chaosTournament.file,
        matchFile({
          era: 'Fourth era',
          competition: 'chaos-cup-8',
          playedDate: new Date('2021-05-15T10:00:00Z'),
          matchId: 1,
        }).file,
      ]),
      bootstrap,
      upsertCompetitionResult,
    });
    tournamentParser.parse.mockReturnValueOnce(chaosTournament.tournament);

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
      externalIds: [{ externalSystemId: 1, externalId: '111' }],
    });
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] });
    const upsertCompetitionResult = vi.fn().mockResolvedValue({ id: 42 });
    const { service } = await makeService({
      files: makeFiles([]),
      bootstrap,
      upsertCompetitionResult,
    });

    const { result } = await service.importCompetitions(eraIdsByName);

    expect(result).toBe(CANNED_RESULT);
  });
});
