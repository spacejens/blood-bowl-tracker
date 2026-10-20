import { UpsertRecorderService } from '@blood-bowl-tracker/import-shared';
import { Injectable } from '@nestjs/common';

import type { ImportError } from './types';

export interface RecordUpsertOptions {
  upsert: () => Promise<unknown>;
  item: unknown;
  errors: ImportError[];
  buildErrorMessage: (error: unknown) => string;
}

export interface RecordUpsertResultOptions<T> {
  upsert: () => Promise<T>;
  item: unknown;
  errors: ImportError[];
  buildErrorMessage: (error: unknown) => string;
}

/**
 * The import tools' upsert bookkeeping. Recording a failed upsert as an
 * ImportError is packages/import-shared's UpsertRecorderService, the same
 * one packages/import-tp-live uses; this service adapts it to the
 * `upsert`-named options the import tools pass.
 */
@Injectable()
export class ImportRunnerService {
  constructor(private readonly recorder: UpsertRecorderService) {}

  async upsertExternalSystem(
    upsert: () => Promise<{ id: number }>,
    name: string,
  ): Promise<number> {
    try {
      const result = await upsert();
      return result.id;
    } catch (err) {
      throw new Error(
        `Failed to upsert external system "${name}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  /** True on success; false after recording the failure in `errors`. */
  async recordUpsert({
    upsert,
    item,
    errors,
    buildErrorMessage,
  }: RecordUpsertOptions): Promise<boolean> {
    const recorded = await this.recorder.record({
      run: async () => {
        await upsert();
        return true;
      },
      item,
      errors,
      buildErrorMessage,
    });
    return recorded ?? false;
  }

  /** The upsert's value; undefined after recording the failure in `errors`. */
  recordUpsertResult<T>({
    upsert,
    item,
    errors,
    buildErrorMessage,
  }: RecordUpsertResultOptions<T>): Promise<T | undefined> {
    return this.recorder.record({
      run: upsert,
      item,
      errors,
      buildErrorMessage,
    });
  }
}
