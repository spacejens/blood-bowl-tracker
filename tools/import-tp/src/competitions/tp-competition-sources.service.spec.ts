import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import type { TpMatch, TpTournament } from '@blood-bowl-tracker/parse-tp';
import {
  MatchParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import {
  mockEraDataConfigService,
  mockImportResultService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile } from '../source/tp-source-reader';
import { TpSourceReader } from '../source/tp-source-reader';
import { TpCompetitionSourcesService } from './tp-competition-sources.service';

const TP_SYSTEM_ID = 1;
const ERA = 'Fourth era';

/** What the mocked ImportResultService.result returns. */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

const TOURNAMENT: TpTournament = {
  id: 18442,
  name: 'Säsong 30',
  ruleSet: 25,
  phases: [],
  categoryIds: [22308],
};

function tpMatch(id: number): TpMatch {
  return {
    id,
    playedDate: new Date('2026-01-10'),
    name: `Match ${id}`,
    homeTeamTpId: 1,
    awayTeamTpId: 2,
    matchEvents: [],
    homeRosterPlayers: [],
    awayRosterPlayers: [],
    phaseType: 160,
    phaseOrder: 1,
    round: 1,
    winner: 'home',
  };
}

/**
 * A tournament file whose content is already the parsed tournament: the
 * mocked parser hands its content straight back. Parsing itself is covered
 * by packages/parse-tp's own specs.
 */
function tournamentFile(
  competition: string,
  tournament: TpTournament = TOURNAMENT,
  filename = `tournament_${competition}.json`,
): TpSourceFile {
  return {
    era: ERA,
    competition,
    type: 'tournament',
    filename,
    content: tournament,
  };
}

function matchFile(competition: string, match: TpMatch): TpSourceFile {
  return {
    era: ERA,
    competition,
    type: 'match',
    filename: `match_${match.id}.json`,
    content: match,
  };
}

interface MakeServiceOptions {
  files: TpSourceFile[];
  /** Thrown by the directory walk once every file has been yielded. */
  scanError?: Error;
  bootstrapOk?: boolean;
  eraIdsByName?: Map<string, number>;
  getEras?: () => EraDataConfig[];
}

async function makeService({
  files,
  scanError,
  bootstrapOk = true,
  eraIdsByName = new Map([[ERA, 600]]),
  getEras,
}: MakeServiceOptions) {
  const sourceReader = mock<TpSourceReader>();
  sourceReader.files.mockImplementation(async function* () {
    await Promise.resolve();
    yield* files;
    if (scanError !== undefined) {
      throw scanError;
    }
  });
  sourceReader.isBaseTournamentFile.mockImplementation((filename) =>
    /^tournament_[^_]+\.json$/.test(filename),
  );
  const tournamentParser = mock<TournamentParserService>();
  tournamentParser.parse.mockImplementation(
    (content) => content as TpTournament,
  );
  const matchParser = mock<MatchParserService>();
  matchParser.parse.mockImplementation((content) => content as TpMatch);
  const externalSystemBootstrap = mock<ExternalSystemBootstrapService>();
  externalSystemBootstrap.bootstrap.mockResolvedValue(
    bootstrapOk
      ? { ok: true, ids: [TP_SYSTEM_ID] }
      : {
          ok: false,
          error: { item: { externalSystems: ['TP'] }, message: 'db down' },
        },
  );
  const externalSystemName = mock<ExternalSystemNameConfigService>();
  externalSystemName.getTpSystemName.mockReturnValue('TP');
  const importResults = mockImportResultService();
  importResults.result.mockReturnValue(CANNED_RESULT);
  const eraDataConfig = mockEraDataConfigService([ERA]);
  if (getEras !== undefined) {
    eraDataConfig.getEras.mockImplementation(getEras);
  }
  const lookup = mockReferenceLookupService(eraIdsByName, TP_SYSTEM_ID);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpCompetitionSourcesService,
      { provide: TpSourceReader, useValue: sourceReader },
      { provide: TournamentParserService, useValue: tournamentParser },
      { provide: MatchParserService, useValue: matchParser },
      {
        provide: ExternalSystemBootstrapService,
        useValue: externalSystemBootstrap,
      },
      {
        provide: ExternalSystemNameConfigService,
        useValue: externalSystemName,
      },
      { provide: ImportResultService, useValue: importResults },
      { provide: EraDataConfigService, useValue: eraDataConfig },
      { provide: ReferenceLookupService, useValue: lookup },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpCompetitionSourcesService),
    importResults,
    tournamentParser,
    matchParser,
    lookup,
  };
}

/** The errors handed to ImportResultService.result; the collector imports nothing. */
function errorsOf(
  importResults: MockProxy<ImportResultService>,
): ImportError[] {
  const [args] = importResults.result.mock.calls[0];
  expect(args.imported).toBe(0);
  return args.errors;
}

describe('TpCompetitionSourcesService', () => {
  it('collects a competition directory with its tournament, era and parsed matches', async () => {
    const { service, importResults } = await makeService({
      files: [
        tournamentFile('sasong-30'),
        matchFile('sasong-30', tpMatch(1)),
        matchFile('sasong-30', tpMatch(2)),
      ],
    });

    const collected = await service.collect();

    expect(collected.tpSystemId).toBe(TP_SYSTEM_ID);
    expect(collected.competitionsByTpId).toEqual(
      new Map([
        [
          18442,
          {
            tournament: TOURNAMENT,
            era: ERA,
            competition: 'sasong-30',
            eraId: 600,
          },
        ],
      ]),
    );
    expect(collected.matchesByCompetitionTpId).toEqual(
      new Map([[18442, [tpMatch(1), tpMatch(2)]]]),
    );
    expect(collected.result).toBe(CANNED_RESULT);
    expect(errorsOf(importResults)).toEqual([]);
  });

  it('resolves every configured era in one batched call', async () => {
    const { service, lookup } = await makeService({ files: [] });

    await service.collect();

    expect(lookup.lookupMap).toHaveBeenCalledTimes(1);
    expect(lookup.lookupMap).toHaveBeenCalledWith('era', [
      { externalSystemId: TP_SYSTEM_ID, externalId: ERA },
    ]);
  });

  it('ignores a non-base tournament variant file', async () => {
    const { service, tournamentParser } = await makeService({
      files: [
        tournamentFile('sasong-30'),
        tournamentFile(
          'sasong-30',
          TOURNAMENT,
          'tournament_sasong-30_news.json',
        ),
        matchFile('sasong-30', tpMatch(1)),
      ],
    });

    await service.collect();

    expect(tournamentParser.parse).toHaveBeenCalledTimes(1);
  });

  it('accumulates the matches of two directories carrying the same tournament', async () => {
    const { service } = await makeService({
      files: [
        tournamentFile('sasong-30'),
        matchFile('sasong-30', tpMatch(1)),
        tournamentFile('sasong-30-copy'),
        matchFile('sasong-30-copy', tpMatch(2)),
      ],
    });

    const collected = await service.collect();

    expect(collected.matchesByCompetitionTpId.get(18442)).toEqual([
      tpMatch(1),
      tpMatch(2),
    ]);
  });

  it('skips a directory with no base tournament file', async () => {
    const { service, importResults } = await makeService({
      files: [matchFile('sasong-30', tpMatch(1))],
    });

    const collected = await service.collect();

    expect(collected.competitionsByTpId.size).toBe(0);
    expect(errorsOf(importResults)).toEqual([
      {
        item: { era: ERA, competition: 'sasong-30' },
        message:
          'Skipping competition in "Fourth era/sasong-30": no base tournament file (tournament_<slug>.json) was found.',
      },
    ]);
  });

  it('skips a directory whose tournament file does not parse', async () => {
    const { service, importResults, tournamentParser } = await makeService({
      files: [tournamentFile('sasong-30'), matchFile('sasong-30', tpMatch(1))],
    });
    tournamentParser.parse.mockImplementation(() => {
      throw new Error('Invalid TP tournament JSON: id');
    });

    const collected = await service.collect();

    expect(collected.competitionsByTpId.size).toBe(0);
    expect(errorsOf(importResults)).toEqual([
      {
        item: { era: ERA, competition: 'sasong-30' },
        message:
          'Skipping competition in "Fourth era/sasong-30": Invalid TP tournament JSON: id',
      },
    ]);
  });

  it('skips a directory with no dated matches', async () => {
    const { service, importResults } = await makeService({
      files: [tournamentFile('sasong-30')],
    });

    const collected = await service.collect();

    expect(collected.competitionsByTpId.size).toBe(0);
    expect(errorsOf(importResults)).toEqual([
      {
        item: TOURNAMENT,
        message:
          'Skipping competition "Säsong 30" in "Fourth era/sasong-30": no dated matches found.',
      },
    ]);
  });

  it('skips a directory whose era has no known database id', async () => {
    const { service, importResults } = await makeService({
      files: [tournamentFile('sasong-30'), matchFile('sasong-30', tpMatch(1))],
      eraIdsByName: new Map(),
    });

    const collected = await service.collect();

    expect(collected.competitionsByTpId.size).toBe(0);
    expect(errorsOf(importResults)).toEqual([
      {
        item: TOURNAMENT,
        message:
          'Skipping competition "Säsong 30" in "Fourth era/sasong-30": its era "Fourth era" has no known database id — the era may not be imported yet.',
      },
    ]);
  });

  it('records an unparsable match file but still collects the good ones', async () => {
    const { service, importResults, matchParser } = await makeService({
      files: [
        tournamentFile('sasong-30'),
        matchFile('sasong-30', tpMatch(1)),
        matchFile('sasong-30', tpMatch(2)),
      ],
    });
    matchParser.parse
      .mockImplementationOnce(() => {
        throw new Error('bad match');
      })
      .mockImplementation((content) => content as TpMatch);

    const collected = await service.collect();

    expect(collected.matchesByCompetitionTpId.get(18442)).toEqual([tpMatch(2)]);
    expect(errorsOf(importResults)).toEqual([
      {
        item: { era: ERA, competition: 'sasong-30', filename: 'match_1.json' },
        message:
          'Could not parse match file "match_1.json" in "Fourth era/sasong-30": bad match',
      },
    ]);
  });

  it('records one error and collects nothing when the TP system cannot be set up', async () => {
    const { service, importResults } = await makeService({
      files: [tournamentFile('sasong-30'), matchFile('sasong-30', tpMatch(1))],
      bootstrapOk: false,
    });

    const collected = await service.collect();

    expect(collected.tpSystemId).toBeUndefined();
    expect(collected.competitionsByTpId.size).toBe(0);
    expect(errorsOf(importResults)).toEqual([
      { item: { externalSystems: ['TP'] }, message: 'db down' },
    ]);
  });

  it('records one error and collects nothing when the era config cannot be read', async () => {
    const { service, importResults } = await makeService({
      files: [tournamentFile('sasong-30'), matchFile('sasong-30', tpMatch(1))],
      getEras: () => {
        throw new Error('league.eras is missing');
      },
    });

    const collected = await service.collect();

    expect(collected.competitionsByTpId.size).toBe(0);
    expect(errorsOf(importResults)).toEqual([
      { item: { externalSystems: ['TP'] }, message: 'league.eras is missing' },
    ]);
  });

  it('keeps the directories collected before a scan failure, recording it', async () => {
    const { service, importResults } = await makeService({
      files: [tournamentFile('sasong-30'), matchFile('sasong-30', tpMatch(1))],
      scanError: new Error('missing era directory'),
    });

    const collected = await service.collect();

    expect(collected.competitionsByTpId.has(18442)).toBe(true);
    expect(errorsOf(importResults)).toEqual([
      {
        item: { scan: 'competition files' },
        message:
          'Could not complete the competition file scan: missing era directory',
      },
    ]);
  });
});
