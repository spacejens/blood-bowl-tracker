import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { TpCompetitionImportResult } from '@blood-bowl-tracker/api-contract';
import type { ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ImportRunnerService,
} from '@blood-bowl-tracker/import';
import type { TpAward, TpMatch, TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpAwardsReaderService } from './tp-awards-reader.service';
import type { TpCompetitionSource } from './tp-competition-sources.service';
import { TpCompetitionsImportService } from './tp-competitions-import.service';

const CANNED_RESULT: ImportResult = {
  success: true,
  imported: -1,
  errors: [],
};
const AWARD: TpAward = { id: 24112, awardType: 1, rosterId: 179769 };
const ONE = { success: true, imported: 1, errors: [] };
const NOTHING = { success: true, imported: 0, errors: [] };
const IMPORTED: TpCompetitionImportResult = {
  competition: ONE,
  participation: { success: true, imported: 2, errors: [] },
  trophyAwards: ONE,
};
const NOT_IMPORTED: TpCompetitionImportResult = {
  competition: {
    success: false,
    imported: 0,
    errors: [{ item: 1, message: 'no group' }],
  },
  participation: NOTHING,
  trophyAwards: NOTHING,
};

function source(tpId: number, competition: string): TpCompetitionSource {
  return {
    tournament: {
      id: tpId,
      name: `Competition ${tpId}`,
      ruleSet: 25,
      phases: [],
      categoryIds: [],
    },
    era: 'Fourth era',
    competition,
    eraId: 600,
  };
}

function tpMatch(id: number, playedDate: string): TpMatch {
  return {
    id,
    playedDate: new Date(playedDate),
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

function rosterEntry(id: number, competition: string): RosterEntry {
  return {
    roster: mock<TpRoster>({ id }),
    era: 'Fourth era',
    competition,
    content: {},
  };
}

describe('TpCompetitionsImportService', () => {
  let service: TpCompetitionsImportService;
  let client: DeepMockProxy<ApiClient>;
  let awardsReader: MockProxy<TpAwardsReaderService>;
  let importRunner: MockProxy<ImportRunnerService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    awardsReader = mock<TpAwardsReaderService>();
    awardsReader.getAwardsByDirectory.mockResolvedValue(new Map());
    importRunner = mock<ImportRunnerService>();
    importRunner.recordUpsertResult.mockResolvedValue(IMPORTED);
    importResults = mockImportResultService();
    importResults.result.mockReturnValue(CANNED_RESULT);
    const externalSystemName = mock<ExternalSystemNameConfigService>();
    externalSystemName.getTpSystemName.mockReturnValue('TP');
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: TpAwardsReaderService, useValue: awardsReader },
        { provide: ImportRunnerService, useValue: importRunner },
        { provide: ImportResultService, useValue: importResults },
        {
          provide: ExternalSystemNameConfigService,
          useValue: externalSystemName,
        },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionsImportService);
  });

  it("sends each competition with its dates, era, directory's registered rosters and awards", async () => {
    awardsReader.getAwardsByDirectory.mockResolvedValue(
      new Map([['Fourth era::sasong-30', [AWARD]]]),
    );

    await service.importCompetitions({
      competitionsByTpId: new Map([[18442, source(18442, 'sasong-30')]]),
      matchesByCompetitionTpId: new Map([
        [18442, [tpMatch(1, '2026-01-10'), tpMatch(2, '2026-06-20')]],
      ]),
      rosters: [
        rosterEntry(163386, 'sasong-30'),
        rosterEntry(163386, 'sasong-30'),
        rosterEntry(179769, 'sasong-30'),
        rosterEntry(555, 'chaos-cup-8'),
      ],
    });

    const [options] = importRunner.recordUpsertResult.mock.calls[0];
    expect(options.item).toEqual({ competition: 18442 });
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import competition 18442: boom',
    );
    expect(options.buildErrorMessage('boom')).toBe(
      'Failed to import competition 18442: boom',
    );
    client.tpCompetitions.import.mockResolvedValue(IMPORTED);
    await options.upsert();
    expect(client.tpCompetitions.import).toHaveBeenCalledWith({
      tournament: { id: 18442, name: 'Competition 18442' },
      playedDates: [new Date('2026-01-10'), new Date('2026-06-20')],
      era: 'Fourth era',
      participantRosterIds: [163386, 179769],
      awards: [AWARD],
      externalSystemName: 'TP',
    });
  });

  it('sends empty lists for a competition with no matches, rosters or awards', async () => {
    await service.importCompetitions({
      competitionsByTpId: new Map([[18442, source(18442, 'sasong-30')]]),
      matchesByCompetitionTpId: new Map(),
      rosters: [],
    });

    const [options] = importRunner.recordUpsertResult.mock.calls[0];
    client.tpCompetitions.import.mockResolvedValue(IMPORTED);
    await options.upsert();
    expect(client.tpCompetitions.import).toHaveBeenCalledWith(
      expect.objectContaining({
        playedDates: [],
        participantRosterIds: [],
        awards: [],
      }),
    );
  });

  it('tallies each stage across competitions and lists the competitions the server upserted', async () => {
    importRunner.recordUpsertResult
      .mockResolvedValueOnce(IMPORTED)
      .mockResolvedValueOnce(NOT_IMPORTED);

    const outcome = await service.importCompetitions({
      competitionsByTpId: new Map([
        [18442, source(18442, 'sasong-30')],
        [20000, source(20000, 'chaos-cup-8')],
      ]),
      matchesByCompetitionTpId: new Map(),
      rosters: [],
    });

    expect(importResults.result.mock.calls).toEqual([
      [{ imported: 1, errors: [{ item: 1, message: 'no group' }] }],
      [{ imported: 2, errors: [] }],
      [{ imported: 1, errors: [] }],
    ]);
    expect(outcome.importedTpIds).toEqual([18442]);
    expect(outcome.competitionResult).toBe(CANNED_RESULT);
  });

  it('counts nothing for a call that failed outright, recording the error in the competition stage', async () => {
    const failure = { item: { competition: 18442 }, message: 'boom' };
    importRunner.recordUpsertResult.mockImplementation((options) => {
      // The real ImportRunnerService pushes onto the errors array it's given
      // when its upsert call rejects. Mimicking that here proves
      // importCompetitions passes it the exact array its own competition
      // tally later reads back, not a copy.
      options.errors.push(failure);
      return Promise.resolve(undefined);
    });

    const outcome = await service.importCompetitions({
      competitionsByTpId: new Map([[18442, source(18442, 'sasong-30')]]),
      matchesByCompetitionTpId: new Map(),
      rosters: [],
    });

    expect(outcome.importedTpIds).toEqual([]);
    expect(importResults.result.mock.calls[0]).toEqual([
      { imported: 0, errors: [failure] },
    ]);
  });

  it('reports the awards of a directory no collected competition matches', async () => {
    awardsReader.getAwardsByDirectory.mockResolvedValue(
      new Map([['Fourth era::gone', [AWARD, AWARD]]]),
    );

    await service.importCompetitions({
      competitionsByTpId: new Map(),
      matchesByCompetitionTpId: new Map(),
      rosters: [],
    });

    expect(importResults.result.mock.calls[2]).toEqual([
      {
        imported: 0,
        errors: [
          {
            item: { directory: 'Fourth era::gone' },
            message:
              'Skipped 2 award row(s) in "Fourth era::gone": no imported competition matches that directory.',
          },
        ],
      },
    ]);
  });

  it('reports an unreadable awards file in the trophy-awards stage', async () => {
    const unreadable = { item: { filename: 'awards_x.json' }, message: 'bad' };
    awardsReader.getAwardsByDirectory.mockImplementation((errors) => {
      errors.push(unreadable);
      return Promise.resolve(new Map<string, TpAward[]>());
    });

    await service.importCompetitions({
      competitionsByTpId: new Map(),
      matchesByCompetitionTpId: new Map(),
      rosters: [],
    });

    expect(importResults.result.mock.calls[2]).toEqual([
      { imported: 0, errors: [unreadable] },
    ]);
  });
});
