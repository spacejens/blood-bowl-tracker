import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  SppAdjustmentsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { BblScrapedSpp } from './bbl-spp-adjustments-import.service';
import { BblSppAdjustmentsImportService } from './bbl-spp-adjustments-import.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import-shared/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
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

describe('BblSppAdjustmentsImportService', () => {
  let service: BblSppAdjustmentsImportService;
  let adjustments: MockProxy<SppAdjustmentsImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    adjustments = mock<SppAdjustmentsImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockReturnValue(CANNED_RESULT);
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

    await service.importSppAdjustments(
      new Map([
        [1, { scrapedTotal: 16, reportedUnspentSpp: -2 }],
        [2, { scrapedTotal: null, reportedUnspentSpp: null }],
      ]),
    );

    expect(adjustments.syncScrapedSppAdjustments).toHaveBeenCalledTimes(1);
    expect(adjustments.syncScrapedSppAdjustments).toHaveBeenCalledWith(
      {
        players: [
          { playerId: 1, scrapedTotal: 16, reportedUnspentSpp: -2 },
          { playerId: 2, scrapedTotal: null },
        ],
      },
      [],
    );
    expect(resultArgs(importResults)).toEqual({ imported: 2, errors: [] });
  });

  it('chunks a player list larger than DEFAULT_BATCH_CHUNK_SIZE, summing imported across chunks', async () => {
    const scraped = new Map<number, BblScrapedSpp>();
    for (let i = 1; i <= DEFAULT_BATCH_CHUNK_SIZE + 3; i += 1) {
      scraped.set(i, { scrapedTotal: i, reportedUnspentSpp: null });
    }
    adjustments.syncScrapedSppAdjustments
      .mockResolvedValueOnce({
        updatedPlayerIds: Array.from(
          { length: DEFAULT_BATCH_CHUNK_SIZE },
          (_v, i) => i + 1,
        ),
      })
      .mockResolvedValueOnce({ updatedPlayerIds: [1, 2, 3] });

    await service.importSppAdjustments(scraped);

    expect(adjustments.syncScrapedSppAdjustments).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] =
      adjustments.syncScrapedSppAdjustments.mock.calls;
    expect(firstCall[0].players).toHaveLength(DEFAULT_BATCH_CHUNK_SIZE);
    expect(secondCall[0].players).toHaveLength(3);
    expect(resultArgs(importResults).imported).toBe(
      DEFAULT_BATCH_CHUNK_SIZE + 3,
    );
  });

  it('keeps going after a failed chunk and counts the surviving one', async () => {
    const scraped = new Map<number, BblScrapedSpp>();
    for (let i = 1; i <= DEFAULT_BATCH_CHUNK_SIZE + 1; i += 1) {
      scraped.set(i, { scrapedTotal: null, reportedUnspentSpp: null });
    }
    adjustments.syncScrapedSppAdjustments
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ updatedPlayerIds: [1] });

    await service.importSppAdjustments(scraped);

    expect(adjustments.syncScrapedSppAdjustments).toHaveBeenCalledTimes(2);
    expect(resultArgs(importResults).imported).toBe(1);
  });

  it('makes no call at all for an empty map', async () => {
    await service.importSppAdjustments(new Map());

    expect(adjustments.syncScrapedSppAdjustments).not.toHaveBeenCalled();
    expect(resultArgs(importResults)).toEqual({ imported: 0, errors: [] });
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const outcome = await service.importSppAdjustments(new Map());

    expect(outcome.result).toBe(CANNED_RESULT);
  });
});
