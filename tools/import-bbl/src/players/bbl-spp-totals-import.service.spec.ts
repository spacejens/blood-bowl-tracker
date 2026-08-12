import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
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
    expect(resultArgs().imported).toBe(3);
    expect(resultArgs().errors).toHaveLength(0);
    expect(outcome.result).toBe(CANNED_RESULT);
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
