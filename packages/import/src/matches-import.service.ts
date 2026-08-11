import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertMatch } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import type { BatchBuffer } from './batch-buffer.service';
import { BatchBufferService } from './batch-buffer.service';
import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class MatchesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
    private readonly batchBuffer: BatchBufferService,
  ) {}

  private static errorMessage(data: UpsertMatch) {
    const bblId = data.externalIds[0]?.externalId;
    return (err: unknown): string =>
      `Failed to import match "${bblId}": ${err instanceof Error ? err.message : String(err)}`;
  }

  upsertMatch(data: UpsertMatch, errors: ImportError[]): Promise<boolean> {
    return this.importRunner.recordUpsert({
      upsert: () => this.client.matches.upsert(data),
      item: data,
      errors,
      buildErrorMessage: MatchesImportService.errorMessage(data),
    });
  }

  /**
   * Like {@link upsertMatch}, but resolves to the upserted match (including
   * its DB `id`) on success, or `undefined` on failure. Used where the
   * caller needs the match's DB id (e.g. to link match events to it).
   */
  upsertMatchResult(
    data: UpsertMatch,
    errors: ImportError[],
  ): Promise<{ id: number } | undefined> {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.matches.upsert(data),
      item: data,
      errors,
      buildErrorMessage: MatchesImportService.errorMessage(data),
    });
  }

  /**
   * Opens a batch of match upserts sharing one `errors` list. Used by the
   * match-teams sync loops, whose iterations do not consume the upsert's
   * result; call sites that need the new match's DB id keep
   * {@link upsertMatchResult}.
   */
  createBatch(errors: ImportError[]): BatchBuffer<UpsertMatch> {
    return this.batchBuffer.create({
      upsertBatch: (items) => this.client.matches.upsertBatch(items),
      errors,
      buildErrorMessage: (item, message) =>
        `Failed to import match "${item.externalIds[0]?.externalId}": ${message}`,
    });
  }

  /** Buffers one match; returns how many items an auto-flush imported (0 if none). */
  addToBatch(
    batch: BatchBuffer<UpsertMatch>,
    data: UpsertMatch,
  ): Promise<number> {
    return this.batchBuffer.add(batch, data);
  }

  /** Sends the trailing partial chunk; returns how many items it imported. */
  flushBatch(batch: BatchBuffer<UpsertMatch>): Promise<number> {
    return this.batchBuffer.flush(batch);
  }
}
