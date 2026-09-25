import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { KeywordsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** The curated keyword catalogue, addressed by the numeric code TP publishes. */
export interface TpOfficialKeywordCatalog {
  byCode: Map<number, { keywordId: number; name: string }>;
}

/** Options for {@link TpOfficialKeywordCatalogService.load}. */
export interface LoadKeywordCatalogOptions {
  tpSystemId: number;
  errors: ImportError[];
}

@Injectable()
export class TpOfficialKeywordCatalogService {
  constructor(
    private readonly keywords: KeywordsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Reads the curated keyword catalogue once and keys it by TP's numeric
   * code. TP publishes keywords only as codes -- a position's keyword codes
   * and a Hatred or Animosity skill's type-3 target -- and names none of them;
   * the names are curated in tools/import-manual with each code as a TP
   * external id. A non-numeric id addresses no TP code and is skipped. A
   * failed read records one error and yields an empty catalogue, so each
   * consumer reports its own unresolved codes instead.
   */
  async load({
    tpSystemId,
    errors,
  }: LoadKeywordCatalogOptions): Promise<TpOfficialKeywordCatalog> {
    const rows = await this.runner.record({
      run: () => this.keywords.listByExternalSystem(tpSystemId),
      item: { keywordCatalog: tpSystemId },
      errors,
      buildErrorMessage: (error) =>
        `Failed to read the keyword catalogue: ${this.runner.messageOf(error)}`,
    });
    const byCode = new Map<number, { keywordId: number; name: string }>();
    for (const row of rows ?? []) {
      const code = Number(row.externalId);
      if (!Number.isInteger(code)) {
        continue;
      }
      byCode.set(code, { keywordId: row.keywordId, name: row.name });
    }
    return { byCode };
  }
}
