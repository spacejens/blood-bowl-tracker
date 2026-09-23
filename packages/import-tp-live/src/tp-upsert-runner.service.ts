import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/** Options for {@link TpUpsertRunnerService.record}. */
export interface RecordOptions<T> {
  run: () => Promise<T>;
  /** What the call concerns, recorded as the ImportError's item on failure. */
  item: unknown;
  errors: ImportError[];
  buildErrorMessage: (error: unknown) => string;
}

/**
 * Runs one packages/game-data call and turns a thrown error into one
 * ImportError, so one bad team, player or read never aborts the rest of an
 * import — the server-side counterpart of packages/import's
 * ImportRunnerService.recordUpsertResult. Constructor-free, pure exception
 * classification (like api-server's UpsertHandlerService), so specs may pass
 * it as a real provider.
 */
@Injectable()
export class TpUpsertRunnerService {
  async record<T>({
    run,
    item,
    errors,
    buildErrorMessage,
  }: RecordOptions<T>): Promise<T | undefined> {
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
