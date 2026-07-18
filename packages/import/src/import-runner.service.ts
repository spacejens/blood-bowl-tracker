import { Injectable } from '@nestjs/common';

import type { ImportError } from './types';
import { makeImportError } from './types';

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

@Injectable()
export class ImportRunnerService {
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

  async recordUpsert({
    upsert,
    item,
    errors,
    buildErrorMessage,
  }: RecordUpsertOptions): Promise<boolean> {
    try {
      await upsert();
      return true;
    } catch (err) {
      errors.push(makeImportError({ item, message: buildErrorMessage(err) }));
      return false;
    }
  }

  async recordUpsertResult<T>({
    upsert,
    item,
    errors,
    buildErrorMessage,
  }: RecordUpsertResultOptions<T>): Promise<T | undefined> {
    try {
      return await upsert();
    } catch (err) {
      errors.push(makeImportError({ item, message: buildErrorMessage(err) }));
      return undefined;
    }
  }
}
