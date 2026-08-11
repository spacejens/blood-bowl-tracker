import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import type { BatchBuffer } from './batch-buffer.service';
import { BatchBufferService } from './batch-buffer.service';
import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class MatchEventsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
    private readonly batchBuffer: BatchBufferService,
  ) {}

  upsertMatchEvent(
    data: UpsertMatchEvent,
    errors: ImportError[],
  ): Promise<boolean> {
    const externalId = data.externalIds[0]?.externalId;
    return this.importRunner.recordUpsert({
      upsert: () => this.client.matchEvents.upsert(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to import match event "${externalId}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  /**
   * Opens a batch of match-event upserts sharing one `errors` list. Callers
   * feed it with {@link addToBatch} and must call {@link flushBatch} once at
   * the end of the phase to send the trailing partial chunk.
   */
  createBatch(errors: ImportError[]): BatchBuffer<UpsertMatchEvent> {
    return this.batchBuffer.create({
      upsertBatch: (items) => this.client.matchEvents.upsertBatch(items),
      errors,
      buildErrorMessage: (item, message) =>
        `Failed to import match event "${item.externalIds[0]?.externalId}": ${message}`,
    });
  }

  /** Buffers one event; returns how many items an auto-flush imported (0 if none). */
  addToBatch(
    batch: BatchBuffer<UpsertMatchEvent>,
    data: UpsertMatchEvent,
  ): Promise<number> {
    return this.batchBuffer.add(batch, data);
  }

  /** Sends the trailing partial chunk; returns how many items it imported. */
  flushBatch(batch: BatchBuffer<UpsertMatchEvent>): Promise<number> {
    return this.batchBuffer.flush(batch);
  }
}
