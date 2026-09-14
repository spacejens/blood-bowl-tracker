import {
  DEFAULT_BATCH_CHUNK_SIZE,
  ImportResultService,
  LastingInjuriesImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblLastingInjuryBackfillImportService } from './bbl-lasting-injury-backfill-import.service';

describe('BblLastingInjuryBackfillImportService', () => {
  let service: BblLastingInjuryBackfillImportService;
  let backfill: MockProxy<LastingInjuriesImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    backfill = mock<LastingInjuriesImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockImplementation(({ imported, errors }) => ({
      success: errors.length === 0,
      imported,
      errors,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblLastingInjuryBackfillImportService,
        { provide: LastingInjuriesImportService, useValue: backfill },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(BblLastingInjuryBackfillImportService);
  });

  it('sends every inserted player id and counts the backfilled ones', async () => {
    backfill.syncLastingInjuryHistory.mockResolvedValue({
      backfilledPlayerIds: [1],
    });

    const outcome = await service.importLastingInjuryHistory([1, 2]);

    expect(backfill.syncLastingInjuryHistory).toHaveBeenCalledTimes(1);
    expect(backfill.syncLastingInjuryHistory).toHaveBeenCalledWith(
      { playerIds: [1, 2] },
      [],
    );
    // `imported` counts players whose history really was manufactured, not
    // players examined: most players need nothing.
    expect(outcome.result.imported).toBe(1);
    expect(outcome.result.success).toBe(true);
  });

  it('chunks a list larger than DEFAULT_BATCH_CHUNK_SIZE, summing across chunks', async () => {
    const ids = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 3 },
      (_v, i) => i + 1,
    );
    backfill.syncLastingInjuryHistory
      .mockResolvedValueOnce({ backfilledPlayerIds: [1, 2] })
      .mockResolvedValueOnce({ backfilledPlayerIds: [3] });

    const outcome = await service.importLastingInjuryHistory(ids);

    expect(backfill.syncLastingInjuryHistory).toHaveBeenCalledTimes(2);
    const [first, second] = backfill.syncLastingInjuryHistory.mock.calls;
    expect(first[0].playerIds).toHaveLength(DEFAULT_BATCH_CHUNK_SIZE);
    expect(second[0].playerIds).toHaveLength(3);
    expect(outcome.result.imported).toBe(3);
  });

  it('keeps going after a failed chunk and counts the surviving one', async () => {
    const ids = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 1 },
      (_v, i) => i + 1,
    );
    backfill.syncLastingInjuryHistory
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ backfilledPlayerIds: [1] });

    const outcome = await service.importLastingInjuryHistory(ids);

    expect(backfill.syncLastingInjuryHistory).toHaveBeenCalledTimes(2);
    const [, second] = backfill.syncLastingInjuryHistory.mock.calls;
    expect(second[0].playerIds).toEqual([DEFAULT_BATCH_CHUNK_SIZE + 1]);
    expect(outcome.result.imported).toBe(1);
  });

  it('makes no call at all when this run inserted no players', async () => {
    const outcome = await service.importLastingInjuryHistory([]);

    expect(backfill.syncLastingInjuryHistory).not.toHaveBeenCalled();
    expect(outcome.result.imported).toBe(0);
    expect(outcome.result.success).toBe(true);
  });
});
