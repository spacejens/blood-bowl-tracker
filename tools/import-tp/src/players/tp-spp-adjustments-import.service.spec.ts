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

    const outcome = await service.importSppAdjustments([1, 2, 2]);

    expect(adjustments.syncReportedSppAdjustments).toHaveBeenCalledWith(
      { players: [{ playerId: 1 }, { playerId: 2 }] },
      [],
    );
    expect(outcome.result.imported).toBe(2);
    expect(outcome.result.success).toBe(true);
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

    const outcome = await service.importSppAdjustments(ids);

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

    const outcome = await service.importSppAdjustments(ids);

    expect(outcome.result.imported).toBe(1);
  });

  it('makes no call at all for an empty id list', async () => {
    const outcome = await service.importSppAdjustments([]);

    expect(adjustments.syncReportedSppAdjustments).not.toHaveBeenCalled();
    expect(outcome.result.imported).toBe(0);
  });
});
