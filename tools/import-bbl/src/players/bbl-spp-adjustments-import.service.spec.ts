import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  SppAdjustmentsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblSppAdjustmentsImportService } from './bbl-spp-adjustments-import.service';

describe('BblSppAdjustmentsImportService', () => {
  let service: BblSppAdjustmentsImportService;
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
        BblSppAdjustmentsImportService,
        { provide: SppAdjustmentsImportService, useValue: adjustments },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(BblSppAdjustmentsImportService);
  });

  it('sends every player with their scraped total, including a null one', async () => {
    adjustments.syncScrapedSppAdjustments.mockResolvedValue({
      updatedPlayerIds: [1, 2],
    });

    const outcome = await service.importSppAdjustments(
      new Map([
        [1, 16],
        [2, null],
      ]),
    );

    expect(adjustments.syncScrapedSppAdjustments).toHaveBeenCalledTimes(1);
    expect(adjustments.syncScrapedSppAdjustments).toHaveBeenCalledWith(
      {
        players: [
          { playerId: 1, scrapedTotal: 16 },
          { playerId: 2, scrapedTotal: null },
        ],
      },
      [],
    );
    expect(outcome.result.imported).toBe(2);
    expect(outcome.result.success).toBe(true);
  });

  it('chunks a player list larger than DEFAULT_BATCH_CHUNK_SIZE, summing imported across chunks', async () => {
    const scraped = new Map<number, number | null>();
    for (let i = 1; i <= DEFAULT_BATCH_CHUNK_SIZE + 3; i += 1) {
      scraped.set(i, i);
    }
    adjustments.syncScrapedSppAdjustments
      .mockResolvedValueOnce({
        updatedPlayerIds: Array.from(
          { length: DEFAULT_BATCH_CHUNK_SIZE },
          (_v, i) => i + 1,
        ),
      })
      .mockResolvedValueOnce({ updatedPlayerIds: [1, 2, 3] });

    const outcome = await service.importSppAdjustments(scraped);

    expect(adjustments.syncScrapedSppAdjustments).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] =
      adjustments.syncScrapedSppAdjustments.mock.calls;
    expect(firstCall[0].players).toHaveLength(DEFAULT_BATCH_CHUNK_SIZE);
    expect(secondCall[0].players).toHaveLength(3);
    expect(outcome.result.imported).toBe(DEFAULT_BATCH_CHUNK_SIZE + 3);
  });

  it('keeps going after a failed chunk and counts the surviving one', async () => {
    const scraped = new Map<number, number | null>();
    for (let i = 1; i <= DEFAULT_BATCH_CHUNK_SIZE + 1; i += 1) {
      scraped.set(i, null);
    }
    adjustments.syncScrapedSppAdjustments
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ updatedPlayerIds: [1] });

    const outcome = await service.importSppAdjustments(scraped);

    expect(adjustments.syncScrapedSppAdjustments).toHaveBeenCalledTimes(2);
    expect(outcome.result.imported).toBe(1);
  });

  it('makes no call at all for an empty map', async () => {
    const outcome = await service.importSppAdjustments(new Map());

    expect(adjustments.syncScrapedSppAdjustments).not.toHaveBeenCalled();
    expect(outcome.result.imported).toBe(0);
    expect(outcome.result.success).toBe(true);
  });
});
