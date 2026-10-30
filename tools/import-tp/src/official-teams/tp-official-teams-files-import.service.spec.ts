import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  TpOfficialRace,
  TpOfficialTeamsImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ImportRunnerService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { MonotonicClockService } from './monotonic-clock.service';
import {
  officialRace,
  racePositions,
  STATS,
} from './official-teams.test-helpers';
import { TpOfficialStarNormalizerService } from './tp-official-star-normalizer.service';
import type { MergedOfficialTeamsChunks } from './tp-official-teams-chunk-merge.service';
import { TpOfficialTeamsChunkMergeService } from './tp-official-teams-chunk-merge.service';
import {
  OFFICIAL_TEAMS_POSITION_BUDGET,
  TpOfficialTeamsChunkerService,
} from './tp-official-teams-chunker.service';
import { TpOfficialTeamsFilesImportService } from './tp-official-teams-files-import.service';

const CANNED_RESULT: ImportResult = { success: true, imported: -1, errors: [] };
const ONE = { success: true, imported: 1, errors: [] };

const ORC = officialRace({
  name: 'Orc',
  teamRaceCode: 'orc20',
  positions: racePositions(3),
});
const ORC_LEGACY = officialRace({
  name: 'Orc',
  teamRaceCode: 'orcLegacy20',
  isOfficial: false,
  positions: racePositions(2),
});
const DWARF = officialRace({
  name: 'Dwarf',
  teamRaceCode: 'dwarf20',
  positions: racePositions(4),
});
const ELF = officialRace({
  name: 'Elf',
  teamRaceCode: 'elf25',
  positions: racePositions(1),
});

function outcome(
  overrides: Partial<TpOfficialTeamsImportResult> = {},
): TpOfficialTeamsImportResult {
  return {
    races: ONE,
    positions: ONE,
    characteristics: ONE,
    keywords: ONE,
    startingSkills: ONE,
    skillCategories: ONE,
    positionCharacteristics: [],
    ...overrides,
  };
}

function merged(): MergedOfficialTeamsChunks {
  const tally = (imported: number) => ({ imported, errors: [] });
  return {
    tallies: {
      races: tally(1),
      positions: tally(2),
      characteristics: tally(3),
      keywords: tally(4),
      startingSkills: tally(5),
      skillCategories: tally(6),
    },
    characteristicsByPositionId: new Map([[9, new Map([[20, STATS]])]]),
  };
}

describe('TpOfficialTeamsFilesImportService', () => {
  let service: TpOfficialTeamsFilesImportService;
  let client: DeepMockProxy<ApiClient>;
  let importRunner: MockProxy<ImportRunnerService>;
  let importResults: MockProxy<ImportResultService>;
  let starNormalizer: MockProxy<TpOfficialStarNormalizerService>;
  let chunker: MockProxy<TpOfficialTeamsChunkerService>;
  let chunkMerge: MockProxy<TpOfficialTeamsChunkMergeService>;
  let clock: MockProxy<MonotonicClockService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    importRunner = mock<ImportRunnerService>();
    importRunner.recordUpsertResult.mockResolvedValue(outcome());
    importResults = mockImportResultService();
    importResults.result.mockReturnValue(CANNED_RESULT);
    starNormalizer = mock<TpOfficialStarNormalizerService>();
    starNormalizer.normalize.mockImplementation((races) => races);
    chunker = mock<TpOfficialTeamsChunkerService>();
    chunker.chunk.mockImplementation(({ races }) => [races]);
    chunkMerge = mock<TpOfficialTeamsChunkMergeService>();
    chunkMerge.merge.mockReturnValue(merged());
    clock = mock<MonotonicClockService>();
    clock.nowMs.mockReturnValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialTeamsFilesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: importRunner },
        { provide: ImportResultService, useValue: importResults },
        { provide: TpOfficialStarNormalizerService, useValue: starNormalizer },
        { provide: TpOfficialTeamsChunkerService, useValue: chunker },
        { provide: TpOfficialTeamsChunkMergeService, useValue: chunkMerge },
        { provide: MonotonicClockService, useValue: clock },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsFilesImportService);
  });

  it("normalizes each rules set's races, then chunks them within the position budget", async () => {
    const normalized: TpOfficialRace[] = [ORC, ORC_LEGACY];
    starNormalizer.normalize.mockReturnValueOnce(normalized);

    await service.importOfficialTeams({
      officialTeams: [
        { race: ORC, rulesSet: 'BB2020' },
        { race: ELF, rulesSet: 'BB2025' },
        { race: ORC_LEGACY, rulesSet: 'BB2020' },
      ],
      skillMastersByMasterId: new Map(),
    });

    expect(starNormalizer.normalize.mock.calls).toEqual([
      [[ORC, ORC_LEGACY]],
      [[ELF]],
    ]);
    expect(chunker.chunk).toHaveBeenNthCalledWith(1, {
      races: normalized,
      positionBudget: OFFICIAL_TEAMS_POSITION_BUDGET,
    });
  });

  it('sends each chunk as its own request, with every scanned skill name', async () => {
    chunker.chunk.mockReturnValueOnce([[ORC, ORC_LEGACY], [DWARF]]);

    await service.importOfficialTeams({
      officialTeams: [
        { race: ORC, rulesSet: 'BB2020' },
        { race: ORC_LEGACY, rulesSet: 'BB2020' },
        { race: DWARF, rulesSet: 'BB2020' },
      ],
      skillMastersByMasterId: new Map([
        [41, { name: 'Block', isElite: false }],
      ]),
    });

    expect(importRunner.recordUpsertResult).toHaveBeenCalledTimes(2);
    const [first] = importRunner.recordUpsertResult.mock.calls[0];
    expect(first.item).toEqual({ rulesSet: 'BB2020', races: ['Orc'] });
    client.tpOfficialTeams.import.mockResolvedValue(outcome());
    await first.upsert();
    expect(client.tpOfficialTeams.import).toHaveBeenCalledWith({
      rulesSet: 'BB2020',
      races: [ORC, ORC_LEGACY],
      skillMasters: [{ skillMasterId: 41, name: 'Block', isElite: false }],
      externalSystemName: TP_EXTERNAL_SYSTEM_NAME,
    });
    const [second] = importRunner.recordUpsertResult.mock.calls[1];
    expect(second.item).toEqual({ rulesSet: 'BB2020', races: ['Dwarf'] });
  });

  it('names the rules set and the races of a request that failed', async () => {
    chunker.chunk.mockReturnValueOnce([[ORC, DWARF]]);

    await service.importOfficialTeams({
      officialTeams: [
        { race: ORC, rulesSet: 'BB2020' },
        { race: DWARF, rulesSet: 'BB2020' },
      ],
      skillMastersByMasterId: new Map(),
    });

    const [options] = importRunner.recordUpsertResult.mock.calls[0];
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import TP\'s official team list for rules set "BB2020", races Orc, Dwarf: boom',
    );
    expect(options.buildErrorMessage('boom')).toBe(
      'Failed to import TP\'s official team list for rules set "BB2020", races Orc, Dwarf: boom',
    );
  });

  it('still sends the other chunks when one fails, and merges only the results that came back', async () => {
    chunker.chunk.mockReturnValueOnce([[ORC], [DWARF]]);
    const failure = {
      item: { rulesSet: 'BB2020', races: ['Orc'] },
      message: 'boom',
    };
    const second = outcome({ keywords: { ...ONE, imported: 7 } });
    importRunner.recordUpsertResult
      .mockImplementationOnce(({ errors }) => {
        errors.push(failure);
        return Promise.resolve(undefined);
      })
      .mockResolvedValueOnce(second);

    await service.importOfficialTeams({
      officialTeams: [
        { race: ORC, rulesSet: 'BB2020' },
        { race: DWARF, rulesSet: 'BB2020' },
      ],
      skillMastersByMasterId: new Map(),
    });

    expect(importRunner.recordUpsertResult).toHaveBeenCalledTimes(2);
    expect(chunkMerge.merge).toHaveBeenCalledWith({
      outcomes: [{ rulesSet: 'BB2020', outcome: second }],
      failureErrors: [failure],
    });
  });

  it('merges nothing but the failures when every chunk fails', async () => {
    chunker.chunk.mockReturnValueOnce([[ORC], [DWARF]]);
    importRunner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.importOfficialTeams({
      officialTeams: [
        { race: ORC, rulesSet: 'BB2020' },
        { race: DWARF, rulesSet: 'BB2020' },
      ],
      skillMastersByMasterId: new Map(),
    });

    expect(chunkMerge.merge).toHaveBeenCalledWith({
      outcomes: [],
      failureErrors: [],
    });
    expect(result.requestTimings).toHaveLength(2);
    expect(result.requestTimings.every((t) => t.stages === undefined)).toBe(
      true,
    );
  });

  it('times every request, keeping the server stages of those that came back', async () => {
    chunker.chunk.mockReturnValueOnce([[ORC], [DWARF], [ELF]]);
    for (const reading of [10, 15, 15, 40, 40, 41.5]) {
      clock.nowMs.mockReturnValueOnce(reading);
    }
    const stages = [{ stage: 'context' as const, ms: 2 }];
    importRunner.recordUpsertResult
      .mockResolvedValueOnce(outcome({ timings: stages }))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(outcome());

    const result = await service.importOfficialTeams({
      officialTeams: [
        { race: ORC, rulesSet: 'BB2020' },
        { race: DWARF, rulesSet: 'BB2020' },
        { race: ELF, rulesSet: 'BB2020' },
      ],
      skillMastersByMasterId: new Map(),
    });

    expect(result.requestTimings).toEqual([
      { rulesSet: 'BB2020', races: ['Orc'], positions: 3, wallMs: 5, stages },
      { rulesSet: 'BB2020', races: ['Dwarf'], positions: 4, wallMs: 25 },
      {
        rulesSet: 'BB2020',
        races: ['Elf'],
        positions: 1,
        wallMs: 1.5,
        stages: [],
      },
    ]);
  });

  it('reports one result per stage from the merged tallies, and the merged characteristics', async () => {
    const result = await service.importOfficialTeams({
      officialTeams: [{ race: ORC, rulesSet: 'BB2020' }],
      skillMastersByMasterId: new Map(),
    });

    expect(importResults.result.mock.calls).toEqual([
      [{ imported: 1, errors: [] }],
      [{ imported: 2, errors: [] }],
      [{ imported: 3, errors: [] }],
      [{ imported: 4, errors: [] }],
      [{ imported: 5, errors: [] }],
      [{ imported: 6, errors: [] }],
    ]);
    expect(result.racesResult).toBe(CANNED_RESULT);
    expect(result.skillCategoriesResult).toBe(CANNED_RESULT);
    expect(result.characteristicsByPositionId).toEqual(
      new Map([[9, new Map([[20, STATS]])]]),
    );
  });

  it('sends nothing when there is no official team list', async () => {
    const result = await service.importOfficialTeams({
      officialTeams: [],
      skillMastersByMasterId: new Map(),
    });

    expect(importRunner.recordUpsertResult).not.toHaveBeenCalled();
    expect(chunkMerge.merge).toHaveBeenCalledWith({
      outcomes: [],
      failureErrors: [],
    });
    expect(result.requestTimings).toEqual([]);
  });
});
