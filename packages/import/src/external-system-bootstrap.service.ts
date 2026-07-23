import type { ExternalSystemCategory } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { ExternalSystemsImportService } from './external-systems-import.service';
import type { ImportError } from './types';
import { makeImportError } from './types';

export type ExternalSystemBootstrapResult =
  { ok: true; ids: number[] } | { ok: false; error: ImportError };

@Injectable()
export class ExternalSystemBootstrapService {
  constructor(
    private readonly externalSystemsImport: ExternalSystemsImportService,
  ) {}

  /**
   * Upsert the external systems an import needs, in order, returning their ids
   * in the same order. On the first failure, returns a not-ok result carrying
   * the ImportError the caller should record before bailing with its own
   * early-return shape. `messagePrefix` is prepended to the failure message for
   * the callers (players, positions) that prefix it.
   */
  async bootstrap(
    names: readonly { name: string; category: ExternalSystemCategory }[],
    messagePrefix = '',
  ): Promise<ExternalSystemBootstrapResult> {
    const ids: number[] = [];
    try {
      for (const { name, category } of names) {
        ids.push(
          await this.externalSystemsImport.upsertExternalSystem(name, category),
        );
      }
    } catch (error) {
      return {
        ok: false,
        error: makeImportError({
          item: { externalSystems: names.map((entry) => entry.name) },
          message: `${messagePrefix}${error instanceof Error ? error.message : String(error)}`,
        }),
      };
    }
    return { ok: true, ids };
  }
}
