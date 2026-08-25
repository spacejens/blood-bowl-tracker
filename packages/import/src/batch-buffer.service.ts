import { Injectable } from '@nestjs/common';

import { ImportResultService } from './import-result.service';
import type { ImportError } from './types';

/**
 * How many items accumulate before a chunk is sent. A deliberate starting
 * point, not a benchmarked value: it bounds both the request payload and the
 * blast radius of a transport-level failure, since a failed request costs a
 * whole chunk's items.
 */
export const DEFAULT_BATCH_CHUNK_SIZE = 500;

/**
 * The per-item outcome every `upsertBatch` procedure returns, narrowed to
 * what the buffer actually reads — a successful entry carries the whole
 * entity too, which is irrelevant here.
 */
export type BatchUpsertOutcome =
  { success: true } | { success: false; error: string };

export interface CreateBatchOptions<TInput> {
  /** Usually `(items) => client.<entity>.upsertBatch(items)`. */
  upsertBatch: (items: TInput[]) => Promise<readonly BatchUpsertOutcome[]>;
  /** The caller's error list, populated exactly as the single-item path does. */
  errors: ImportError[];
  buildErrorMessage: (item: TInput, message: string) => string;
  chunkSize?: number;
}

/**
 * One entity kind's in-flight batch. Plain state rather than a service
 * instance: an import run needs several independent buffers at once, which a
 * DI singleton cannot represent. All behaviour lives in
 * {@link BatchBufferService}.
 */
export interface BatchBuffer<TInput> {
  readonly upsertBatch: (
    items: TInput[],
  ) => Promise<readonly BatchUpsertOutcome[]>;
  readonly errors: ImportError[];
  readonly buildErrorMessage: (item: TInput, message: string) => string;
  readonly chunkSize: number;
  pending: TInput[];
}

/**
 * Accumulates upsert payloads and sends them in fixed-size chunks, so an
 * importer makes one RPC round trip per chunk instead of one per entity.
 * Failure reporting is unchanged from the single-item path: each failed item
 * still produces one `ImportError` with its own payload as `item`.
 */
@Injectable()
export class BatchBufferService {
  constructor(private readonly importResults: ImportResultService) {}

  create<TInput>(options: CreateBatchOptions<TInput>): BatchBuffer<TInput> {
    return {
      upsertBatch: options.upsertBatch,
      errors: options.errors,
      buildErrorMessage: options.buildErrorMessage,
      chunkSize: options.chunkSize ?? DEFAULT_BATCH_CHUNK_SIZE,
      pending: [],
    };
  }

  /**
   * Buffers one item, sending the chunk if it is now full. Returns how many
   * items that send imported — 0 when nothing was sent — so callers keep
   * counting imports themselves, as the single-item path does.
   */
  async add<TInput>(
    buffer: BatchBuffer<TInput>,
    item: TInput,
  ): Promise<number> {
    buffer.pending.push(item);
    if (buffer.pending.length < buffer.chunkSize) {
      return 0;
    }
    return this.flush(buffer);
  }

  /**
   * Sends whatever is still buffered (the trailing partial chunk at the end
   * of an import phase). A whole-request failure — timeout, 5xx, dropped
   * connection — has no single-item equivalent: it is recorded as one error
   * per buffered item so the run still completes and reports accurately.
   */
  async flush<TInput>(buffer: BatchBuffer<TInput>): Promise<number> {
    const items = buffer.pending;
    if (items.length === 0) {
      return 0;
    }
    buffer.pending = [];

    let results: readonly BatchUpsertOutcome[];
    try {
      results = await buffer.upsertBatch(items);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      for (const item of items) {
        this.recordError(buffer, item, `batch request failed: ${cause}`);
      }
      return 0;
    }

    let imported = 0;
    for (const [index, item] of items.entries()) {
      const result = results[index];
      if (result === undefined) {
        this.recordError(
          buffer,
          item,
          'batch response was missing a result for this item',
        );
        continue;
      }
      if (result.success) {
        imported += 1;
        continue;
      }
      this.recordError(buffer, item, result.error);
    }
    return imported;
  }

  private recordError<TInput>(
    buffer: BatchBuffer<TInput>,
    item: TInput,
    message: string,
  ): void {
    buffer.errors.push(
      this.importResults.error({
        item,
        message: buffer.buildErrorMessage(item, message),
      }),
    );
  }
}
