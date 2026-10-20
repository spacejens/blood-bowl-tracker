import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
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

describe('BblLastingInjuryBackfillImportService', () => {
  let service: BblLastingInjuryBackfillImportService;
  let backfill: MockProxy<LastingInjuriesImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    backfill = mock<LastingInjuriesImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockReturnValue(CANNED_RESULT);
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

    await service.importLastingInjuryHistory([1, 2]);

    expect(backfill.syncLastingInjuryHistory).toHaveBeenCalledTimes(1);
    expect(backfill.syncLastingInjuryHistory).toHaveBeenCalledWith(
      { playerIds: [1, 2] },
      [],
    );
    // `imported` counts players whose history really was manufactured, not
    // players examined: most players need nothing.
    expect(resultArgs(importResults)).toEqual({ imported: 1, errors: [] });
  });

  it('chunks a list larger than DEFAULT_BATCH_CHUNK_SIZE, summing across chunks', async () => {
    const ids = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 3 },
      (_v, i) => i + 1,
    );
    backfill.syncLastingInjuryHistory
      .mockResolvedValueOnce({ backfilledPlayerIds: [1, 2] })
      .mockResolvedValueOnce({ backfilledPlayerIds: [3] });

    await service.importLastingInjuryHistory(ids);

    expect(backfill.syncLastingInjuryHistory).toHaveBeenCalledTimes(2);
    const [first, second] = backfill.syncLastingInjuryHistory.mock.calls;
    expect(first[0].playerIds).toHaveLength(DEFAULT_BATCH_CHUNK_SIZE);
    expect(second[0].playerIds).toHaveLength(3);
    expect(resultArgs(importResults).imported).toBe(3);
  });

  it('keeps going after a failed chunk and counts the surviving one', async () => {
    const ids = Array.from(
      { length: DEFAULT_BATCH_CHUNK_SIZE + 1 },
      (_v, i) => i + 1,
    );
    backfill.syncLastingInjuryHistory
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ backfilledPlayerIds: [1] });

    await service.importLastingInjuryHistory(ids);

    expect(backfill.syncLastingInjuryHistory).toHaveBeenCalledTimes(2);
    const [, second] = backfill.syncLastingInjuryHistory.mock.calls;
    expect(second[0].playerIds).toEqual([DEFAULT_BATCH_CHUNK_SIZE + 1]);
    expect(resultArgs(importResults).imported).toBe(1);
  });

  it('makes no call at all when this run inserted no players', async () => {
    await service.importLastingInjuryHistory([]);

    expect(backfill.syncLastingInjuryHistory).not.toHaveBeenCalled();
    expect(resultArgs(importResults)).toEqual({ imported: 0, errors: [] });
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const outcome = await service.importLastingInjuryHistory([]);

    expect(outcome.result).toBe(CANNED_RESULT);
  });
});
