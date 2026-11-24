import { Injectable } from '@nestjs/common';

import type { ImportResult } from './types';

/** What an import CLI prints, and the exit code it ends with. */
export interface ImportRunSummary {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly exitCode: number;
}

/**
 * Folds every step's `ImportResult` into the summary an import CLI prints:
 * the record count on success, or every error with exit code 1. A run
 * succeeds only when every step did. Constructor-free and pure.
 */
@Injectable()
export class ImportRunSummaryService {
  summarize(results: readonly ImportResult[]): ImportRunSummary {
    const combined = this.combine(results);
    if (combined.success) {
      return {
        stdout: [`Imported ${combined.imported} record(s) successfully.`],
        stderr: [],
        exitCode: 0,
      };
    }
    return {
      stdout: [],
      stderr: [
        `Import completed with ${combined.errors.length} errors:`,
        ...combined.errors.map((error) => `  - ${error.message}`),
      ],
      exitCode: 1,
    };
  }

  private combine(results: readonly ImportResult[]): ImportResult {
    return {
      success: results.every((result) => result.success),
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      errors: results.flatMap((result) => result.errors),
    };
  }
}
