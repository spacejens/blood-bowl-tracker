import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { TpMatchImportResult } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  ImportRunnerService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile } from '../source/tp-source-reader';
import { TpSourceReader } from '../source/tp-source-reader';
import { TpMatchFilesImportService } from './tp-match-files-import.service';

function parsed(id: number, overrides: Partial<TpMatch> = {}): TpMatch {
  return {
    id,
    playedDate: new Date('2026-06-13'),
    name: 'Matchday 1',
    homeTeamTpId: id * 10,
    awayTeamTpId: id * 10 + 1,
    matchEvents: [],
    homeRosterPlayers: [],
    awayRosterPlayers: [],
    phaseType: 160,
    phaseOrder: 1,
    round: 1,
    winner: 'home',
    ...overrides,
  };
}

function matchFile(id: number, competition = 'sasong-30'): TpSourceFile {
  return {
    era: 'Fourth era',
    competition,
    type: 'match',
    filename: `match_${id}.json`,
    content: { matchId: id, raw: true },
  };
}

function filesFrom(files: TpSourceFile[]): AsyncIterable<TpSourceFile> {
  return (async function* () {
    await Promise.resolve();
    yield* files;
  })();
}

function outcome(eventsImported: number): TpMatchImportResult {
  return {
    match: { success: true, imported: 1, errors: [] },
    participation: { success: true, imported: 1, errors: [] },
    events: { success: true, imported: eventsImported, errors: [] },
    outcome: {
      success: false,
      imported: 0,
      errors: [{ item: 1, message: 'undecidable' }],
    },
  };
}

const OPTIONS = {
  competitionsByTpId: new Map([
    [18442, { era: 'Fourth era', competition: 'sasong-30' }],
  ]),
  competitionIdsByTpId: new Map([[18442, 12]]),
  matchesByCompetitionTpId: new Map([
    [18442, [parsed(1), parsed(2, { phaseOrder: 2, winner: undefined })]],
  ]),
};

describe('TpMatchFilesImportService', () => {
  let service: TpMatchFilesImportService;
  let client: DeepMockProxy<ApiClient>;
  let sourceReader: MockProxy<TpSourceReader>;
  let importRunner: MockProxy<ImportRunnerService>;
  let importResults: ReturnType<typeof mockImportResultService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    sourceReader = mock<TpSourceReader>();
    importRunner = mock<ImportRunnerService>();
    importResults = mockImportResultService();
    const externalSystemName = mock<ExternalSystemNameConfigService>();
    externalSystemName.getTpSystemName.mockReturnValue('TP');
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchFilesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: TpSourceReader, useValue: sourceReader },
        { provide: ImportRunnerService, useValue: importRunner },
        { provide: ImportResultService, useValue: importResults },
        {
          provide: ExternalSystemNameConfigService,
          useValue: externalSystemName,
        },
      ],
    }).compile();
    service = moduleRef.get(TpMatchFilesImportService);
  });

  it("sends each match file raw, with its competition's bracket, TP id and system name", async () => {
    sourceReader.filesOfType.mockReturnValue(filesFrom([matchFile(1)]));
    importRunner.recordUpsertResult.mockResolvedValue(outcome(3));

    await service.importMatchFiles(OPTIONS);

    expect(sourceReader.filesOfType).toHaveBeenCalledWith('match');
    const [options] = importRunner.recordUpsertResult.mock.calls[0];
    expect(options.item).toEqual({ match: 1, competition: 18442 });
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import match 1: boom',
    );
    expect(options.buildErrorMessage('boom')).toBe(
      'Failed to import match 1: boom',
    );
    client.tpMatches.import.mockResolvedValue(outcome(3));
    await options.upsert();
    expect(client.tpMatches.import).toHaveBeenCalledWith({
      match: { matchId: 1, raw: true },
      bracket: [
        {
          id: 1,
          phaseOrder: 1,
          round: 1,
          homeTeamTpId: 10,
          awayTeamTpId: 11,
          winner: 'home',
        },
        {
          id: 2,
          phaseOrder: 2,
          round: 1,
          homeTeamTpId: 20,
          awayTeamTpId: 21,
          winner: undefined,
        },
      ],
      competitionTpId: 18442,
      externalSystemName: 'TP',
    });
  });

  it("sums every stage's imported count and errors across files, in stage order", async () => {
    sourceReader.filesOfType.mockReturnValue(
      filesFrom([matchFile(1), matchFile(2)]),
    );
    importRunner.recordUpsertResult
      .mockResolvedValueOnce(outcome(3))
      .mockResolvedValueOnce(outcome(4));

    await service.importMatchFiles(OPTIONS);

    expect(importResults.result.mock.calls.map(([args]) => args)).toEqual([
      { imported: 2, errors: [] },
      { imported: 2, errors: [] },
      { imported: 7, errors: [] },
      {
        imported: 0,
        errors: [
          { item: 1, message: 'undecidable' },
          { item: 1, message: 'undecidable' },
        ],
      },
    ]);
  });

  it('skips a file whose competition was not imported', async () => {
    sourceReader.filesOfType.mockReturnValue(
      filesFrom([matchFile(1, 'other-cup')]),
    );

    await service.importMatchFiles(OPTIONS);

    expect(importRunner.recordUpsertResult).not.toHaveBeenCalled();
  });

  it('skips a competition with no resolved database id', async () => {
    sourceReader.filesOfType.mockReturnValue(filesFrom([matchFile(1)]));

    await service.importMatchFiles({
      ...OPTIONS,
      competitionIdsByTpId: new Map(),
    });

    expect(importRunner.recordUpsertResult).not.toHaveBeenCalled();
  });

  it('skips a file that did not parse during the competitions import (already reported there)', async () => {
    sourceReader.filesOfType.mockReturnValue(
      filesFrom([matchFile(99), { ...matchFile(1), content: 'garbage' }]),
    );

    await service.importMatchFiles(OPTIONS);

    expect(importRunner.recordUpsertResult).not.toHaveBeenCalled();
  });

  it('adds nothing for a call the runner recorded as failed', async () => {
    sourceReader.filesOfType.mockReturnValue(filesFrom([matchFile(1)]));
    importRunner.recordUpsertResult.mockResolvedValue(undefined);

    await service.importMatchFiles(OPTIONS);

    expect(importResults.result.mock.calls[0][0]).toEqual({
      imported: 0,
      errors: [],
    });
  });

  it('records one error when the file scan fails part-way', async () => {
    sourceReader.filesOfType.mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('ENOENT')),
      }),
    });

    await service.importMatchFiles(OPTIONS);

    expect(importResults.result.mock.calls[0][0]).toEqual({
      imported: 0,
      errors: [
        {
          item: { scan: 'match files' },
          message: 'Could not complete the match file scan: ENOENT',
        },
      ],
    });
  });
});
