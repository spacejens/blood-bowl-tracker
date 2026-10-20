import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/** Options for {@link UpsertRecorderService.record}. */
export interface UpsertRecordOptions<T> {
  run: () => Promise<T>;
  /** What the call concerns, recorded as the ImportError's item on failure. */
  item: unknown;
  errors: ImportError[];
  buildErrorMessage: (error: unknown) => string;
}

/**
 * Runs one upsert (or read) and turns a thrown error into one ImportError, so
 * one bad item never aborts the rest of an import. Used by packages/import's
 * ImportRunnerService and directly by packages/import-tp-live.
 * Constructor-free, pure exception classification, so specs may pass it as a
 * real provider.
 */
@Injectable()
export class UpsertRecorderService {
  /** The call's own value, or undefined after recording its failure. */
  async record<T>({
    run,
    item,
    errors,
    buildErrorMessage,
  }: UpsertRecordOptions<T>): Promise<T | undefined> {
    try {
      return await run();
    } catch (error) {
      errors.push({ item, message: buildErrorMessage(error) });
      return undefined;
    }
  }

  /** An Error's message, or anything else's string form. */
  messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
