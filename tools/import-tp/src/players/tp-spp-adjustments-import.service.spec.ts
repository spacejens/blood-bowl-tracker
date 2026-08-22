import type { SppCareerCounts } from '@blood-bowl-tracker/api-contract';
import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  SppAdjustmentsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpSppAdjustmentsImportService } from './tp-spp-adjustments-import.service';

const careerCounts: SppCareerCounts = {
  touchdown: 12,
  completion: 4,
  interception: 2,
  mvp_award: 3,
  casualty: 5,
};

describe('TpSppAdjustmentsImportService', () => {
  let service: TpSppAdjustmentsImportService;
  let adjustments: MockProxy<SppAdjustmentsImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    adjustments = mock<SppAdjustmentsImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockImplementation(({ imported, errors }) => ({
      success: errors.length === 0,
      imported,
      errors,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpSppAdjustmentsImportService,
        { provide: SppAdjustmentsImportService, useValue: adjustments },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(TpSppAdjustmentsImportService);
  });

  it('sends the deduplicated player ids in one call', async () => {
    adjustments.syncReportedSppAdjustments.mockResolvedValue({
      updatedPlayerIds: [1, 2],
    });

    const outcome = await service.importSppAdjustments({
      playerIds: [1, 2, 2],
    });

    expect(adjustments.syncReportedSppAdjustments).toHaveBeenCalledWith(
      { players: [{ playerId: 1 }, { playerId: 2 }] },
      [],
    );
    expect(outcome.result.imported).toBe(2);
    expect(outcome.result.success).toBe(true);
  });

  it('attaches each player its career counts when known', async () => {
    adjustments.syncReportedSppAdjustments.mockResolvedValue({
      updatedPlayerIds: [1, 2],
    });

    await service.importSppAdjustments({
      playerIds: [1, 2],
      careerCountsByPlayerId: new Map([[1, careerCounts]]),
    });

    expect(adjustments.syncReportedSppAdjustments).toHaveBeenCalledWith(
      { players: [{ playerId: 1, careerCounts }, { playerId: 2 }] },
      [],
    );
  });

  it('chunks an id list larger than DEFAULT_BATCH_CHUNK_SIZE', async () => {
    const ids = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 2 },
      (_v, i) => i + 1,
    );
    adjustments.syncReportedSppAdjustments
      .mockResolvedValueOnce({
        updatedPlayerIds: ids.slice(0, DEFAULT_BATCH_CHUNK_SIZE),
      })
      .mockResolvedValueOnce({ updatedPlayerIds: [1, 2] });

    const outcome = await service.importSppAdjustments({ playerIds: ids });

    expect(adjustments.syncReportedSppAdjustments).toHaveBeenCalledTimes(2);
    expect(outcome.result.imported).toBe(DEFAULT_BATCH_CHUNK_SIZE + 2);
  });

  it('counts only the surviving chunk when one call fails', async () => {
    const ids = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 1 },
      (_v, i) => i + 1,
    );
    adjustments.syncReportedSppAdjustments
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ updatedPlayerIds: [1] });

    const outcome = await service.importSppAdjustments({ playerIds: ids });

    expect(outcome.result.imported).toBe(1);
  });

  it('makes no call at all for an empty id list', async () => {
    const outcome = await service.importSppAdjustments({ playerIds: [] });

    expect(adjustments.syncReportedSppAdjustments).not.toHaveBeenCalled();
    expect(outcome.result.imported).toBe(0);
    expect(outcome.nonzeroAdjustments).toEqual([]);
  });

  it('collects every chunk nonzero adjustments, biggest first', async () => {
    const ids = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 1 },
      (_v, i) => i + 1,
    );
    adjustments.syncReportedSppAdjustments
      .mockResolvedValueOnce({
        updatedPlayerIds: [1],
        nonzeroAdjustments: [
          {
            playerId: 1,
            name: 'Karcheres',
            adjustment: 3,
            hadCareerCounts: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        updatedPlayerIds: [2],
        nonzeroAdjustments: [
          {
            playerId: 2,
            name: 'Fenriz',
            adjustment: 10,
            hadCareerCounts: true,
          },
        ],
      });

    const outcome = await service.importSppAdjustments({ playerIds: ids });

    expect(outcome.nonzeroAdjustments).toEqual([
      {
        playerId: 2,
        name: 'Fenriz',
        adjustment: 10,
        hadCareerCounts: true,
      },
      {
        playerId: 1,
        name: 'Karcheres',
        adjustment: 3,
        hadCareerCounts: false,
      },
    ]);
  });

  it('tolerates a chunk result without a summary', async () => {
    adjustments.syncReportedSppAdjustments.mockResolvedValue({
      updatedPlayerIds: [1],
    });

    const outcome = await service.importSppAdjustments({ playerIds: [1] });

    expect(outcome.nonzeroAdjustments).toEqual([]);
  });

  it('formats the summary with the biggest adjustment first', () => {
    expect(
      service.summaryLines([
        { playerId: 2, name: 'Fenriz', adjustment: 10, hadCareerCounts: true },
        {
          playerId: 1,
          name: 'Karcheres',
          adjustment: 3,
          hadCareerCounts: true,
        },
      ]),
    ).toEqual([
      '2 player(s) left with an unexplained SPP adjustment:',
      '  - Fenriz (player 2): 10 SPP',
      '  - Karcheres (player 1): 3 SPP',
    ]);
  });

  it('marks only the entries the source reported no career counts for', () => {
    expect(
      service.summaryLines([
        { playerId: 2, name: 'Fenriz', adjustment: 10, hadCareerCounts: false },
        {
          playerId: 1,
          name: 'Karcheres',
          adjustment: 3,
          hadCareerCounts: true,
        },
      ]),
    ).toEqual([
      '2 player(s) left with an unexplained SPP adjustment:',
      '  - Fenriz (player 2): 10 SPP (no TP career counts available)',
      '  - Karcheres (player 1): 3 SPP',
    ]);
  });

  it('formats nothing when no adjustment is left unexplained', () => {
    expect(service.summaryLines([])).toEqual([]);
  });
});
