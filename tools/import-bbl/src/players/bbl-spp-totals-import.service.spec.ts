import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  SppTotalsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblSppTotalsImportService } from './bbl-spp-totals-import.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own success derivation is covered by its own spec;
 * this spec asserts what the service under test passes to result().
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

describe('BblSppTotalsImportService', () => {
  let service: BblSppTotalsImportService;
  let sppTotals: MockProxy<SppTotalsImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    sppTotals = mock<SppTotalsImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockReturnValue(CANNED_RESULT);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblSppTotalsImportService,
        { provide: SppTotalsImportService, useValue: sppTotals },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(BblSppTotalsImportService);
  });

  /** The `{ imported, errors }` the service handed to ImportResultService.result. */
  function resultArgs(): { imported: number; errors: ImportError[] } {
    return importResults.result.mock.calls[0][0];
  }

  it('sends every player id and counts the ids the server reports it wrote', async () => {
    sppTotals.syncComputedSppTotals.mockResolvedValue({
      updatedPlayerIds: [1, 2, 3],
    });

    const outcome = await service.importSppTotals([1, 2, 3]);

    expect(sppTotals.syncComputedSppTotals).toHaveBeenCalledWith(
      { playerIds: [1, 2, 3] },
      expect.anything(),
    );
    expect(sppTotals.syncComputedSppTotals).toHaveBeenCalledTimes(1);
    expect(resultArgs().imported).toBe(3);
    expect(resultArgs().errors).toHaveLength(0);
    expect(outcome.result).toBe(CANNED_RESULT);
  });

  it('chunks a player-id list larger than DEFAULT_BATCH_CHUNK_SIZE into multiple bounded syncComputedSppTotals calls, summing imported across chunks', async () => {
    const playerIds = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 10 },
      (_, i) => i + 1,
    );
    // Canned per-chunk results, not derived from the call's own input --
    // the assertions below must exercise the service's own summing logic,
    // not just echo back what was sent.
    sppTotals.syncComputedSppTotals
      .mockResolvedValueOnce({
        updatedPlayerIds: playerIds.slice(0, DEFAULT_BATCH_CHUNK_SIZE),
      })
      .mockResolvedValueOnce({
        updatedPlayerIds: playerIds.slice(DEFAULT_BATCH_CHUNK_SIZE),
      });

    const outcome = await service.importSppTotals(playerIds);

    expect(sppTotals.syncComputedSppTotals).toHaveBeenCalledTimes(2);
    const [firstCallArgs, secondCallArgs] =
      sppTotals.syncComputedSppTotals.mock.calls;
    expect(firstCallArgs[0].playerIds).toHaveLength(DEFAULT_BATCH_CHUNK_SIZE);
    expect(secondCallArgs[0].playerIds).toHaveLength(10);
    expect(resultArgs().imported).toBe(DEFAULT_BATCH_CHUNK_SIZE + 10);
    expect(outcome.result).toBe(CANNED_RESULT);
  });

  it('still attempts and counts a later chunk when an earlier chunk fails, forwarding the failure into errors', async () => {
    const playerIds = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 5 },
      (_, i) => i + 1,
    );
    const cannedChunkError: ImportError = {
      item: { playerIds: playerIds.slice(0, DEFAULT_BATCH_CHUNK_SIZE) },
      message: 'canned chunk failure',
    };
    sppTotals.syncComputedSppTotals
      // The real SppTotalsImportService pushes its own ImportError onto the
      // shared `errors` array before resolving to undefined on failure --
      // mirror that here instead of only returning undefined, so this test
      // can assert the failure actually reaches the final result.
      .mockImplementationOnce((_input, errors) => {
        errors.push(cannedChunkError);
        return Promise.resolve(undefined);
      })
      .mockResolvedValueOnce({
        updatedPlayerIds: [
          DEFAULT_BATCH_CHUNK_SIZE + 1,
          DEFAULT_BATCH_CHUNK_SIZE + 2,
        ],
      });

    await service.importSppTotals(playerIds);

    expect(sppTotals.syncComputedSppTotals).toHaveBeenCalledTimes(2);
    // Only the second chunk's 2 updated ids are counted; the first chunk's
    // failure neither crashes the loop nor is double-counted.
    expect(resultArgs().imported).toBe(2);
    expect(resultArgs().errors).toEqual([cannedChunkError]);
  });

  it('counts nothing when the sync call failed', async () => {
    // The wrapper already recorded the error into the shared errors array;
    // this service must not double-report it, only avoid counting.
    sppTotals.syncComputedSppTotals.mockResolvedValue(undefined);

    await service.importSppTotals([1, 2]);

    expect(resultArgs().imported).toBe(0);
  });

  it('skips the RPC entirely when no players were imported', async () => {
    await service.importSppTotals([]);

    expect(sppTotals.syncComputedSppTotals).not.toHaveBeenCalled();
    expect(resultArgs().imported).toBe(0);
    expect(resultArgs().errors).toHaveLength(0);
  });
});
