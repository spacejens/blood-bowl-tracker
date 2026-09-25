import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { TpOfficialTeamsImportResult } from '@blood-bowl-tracker/api-contract';
import type { ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ImportRunnerService,
} from '@blood-bowl-tracker/import';
import type { TpOfficialRace } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpOfficialTeamsFilesImportService } from './tp-official-teams-files-import.service';

const CANNED_RESULT: ImportResult = { success: true, imported: -1, errors: [] };
const STATS = { move: 5, strength: 3, agility: 3, passing: 4, armour: 9 };
const ONE = { success: true, imported: 1, errors: [] };

function race(teamRaceCode: string): TpOfficialRace {
  return { name: 'Orc', teamRaceCode, isOfficial: true, positions: [] };
}

function outcome(
  rulesSetId: number,
  overrides: Partial<TpOfficialTeamsImportResult> = {},
): TpOfficialTeamsImportResult {
  return {
    races: ONE,
    positions: ONE,
    characteristics: ONE,
    keywords: ONE,
    startingSkills: ONE,
    positionCharacteristics: [{ positionId: 9, rulesSetId, ...STATS }],
    ...overrides,
  };
}

describe('TpOfficialTeamsFilesImportService', () => {
  let service: TpOfficialTeamsFilesImportService;
  let client: DeepMockProxy<ApiClient>;
  let importRunner: MockProxy<ImportRunnerService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    importRunner = mock<ImportRunnerService>();
    importRunner.recordUpsertResult.mockResolvedValue(outcome(20));
    importResults = mockImportResultService();
    importResults.result.mockReturnValue(CANNED_RESULT);
    const externalSystemName = mock<ExternalSystemNameConfigService>();
    externalSystemName.getTpSystemName.mockReturnValue('TP');
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialTeamsFilesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: importRunner },
        { provide: ImportResultService, useValue: importResults },
        {
          provide: ExternalSystemNameConfigService,
          useValue: externalSystemName,
        },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsFilesImportService);
  });

  it("sends each rules set's races in one call, with every scanned skill name", async () => {
    await service.importOfficialTeams({
      officialTeams: [
        { race: race('orc20'), rulesSet: 'BB2020' },
        { race: race('orc25'), rulesSet: 'BB2025' },
        { race: race('orcLegacy20'), rulesSet: 'BB2020' },
      ],
      skillMastersByMasterId: new Map([
        [41, { name: 'Block', isElite: false }],
      ]),
    });

    expect(importRunner.recordUpsertResult).toHaveBeenCalledTimes(2);
    const [options] = importRunner.recordUpsertResult.mock.calls[0];
    expect(options.item).toEqual({ rulesSet: 'BB2020' });
    expect(options.buildErrorMessage(new Error('boom'))).toBe(
      'Failed to import TP\'s official team list for rules set "BB2020": boom',
    );
    expect(options.buildErrorMessage('boom')).toBe(
      'Failed to import TP\'s official team list for rules set "BB2020": boom',
    );
    client.tpOfficialTeams.import.mockResolvedValue(outcome(20));
    await options.upsert();
    expect(client.tpOfficialTeams.import).toHaveBeenCalledWith({
      rulesSet: 'BB2020',
      races: [race('orc20'), race('orcLegacy20')],
      skillMasters: [{ skillMasterId: 41, name: 'Block', isElite: false }],
      externalSystemName: 'TP',
    });
  });

  it("tallies each stage across rules sets and collects every position's characteristics", async () => {
    const failure = { item: 1, message: 'skill unresolved' };
    importRunner.recordUpsertResult
      .mockResolvedValueOnce(outcome(20))
      .mockResolvedValueOnce(
        outcome(25, {
          startingSkills: { success: false, imported: 2, errors: [failure] },
        }),
      );

    const result = await service.importOfficialTeams({
      officialTeams: [
        { race: race('orc20'), rulesSet: 'BB2020' },
        { race: race('orc25'), rulesSet: 'BB2025' },
      ],
      skillMastersByMasterId: new Map(),
    });

    expect(importResults.result.mock.calls).toEqual([
      [{ imported: 2, errors: [] }],
      [{ imported: 2, errors: [] }],
      [{ imported: 2, errors: [] }],
      [{ imported: 2, errors: [] }],
      [{ imported: 3, errors: [failure] }],
    ]);
    expect(result.racesResult).toBe(CANNED_RESULT);
    expect(result.characteristicsByPositionId).toEqual(
      new Map([
        [
          9,
          new Map([
            [20, STATS],
            [25, STATS],
          ]),
        ],
      ]),
    );
  });

  it('counts nothing for a call that failed outright, recording the error under races', async () => {
    const failure = { item: { rulesSet: 'BB2020' }, message: 'boom' };
    importRunner.recordUpsertResult.mockImplementationOnce(({ errors }) => {
      errors.push(failure);
      return Promise.resolve(undefined);
    });

    const result = await service.importOfficialTeams({
      officialTeams: [{ race: race('orc20'), rulesSet: 'BB2020' }],
      skillMastersByMasterId: new Map(),
    });

    expect(importResults.result.mock.calls[0]).toEqual([
      { imported: 0, errors: [failure] },
    ]);
    expect(result.characteristicsByPositionId.size).toBe(0);
  });

  it('makes no call when there is no official team list', async () => {
    await service.importOfficialTeams({
      officialTeams: [],
      skillMastersByMasterId: new Map(),
    });

    expect(importRunner.recordUpsertResult).not.toHaveBeenCalled();
  });
});
