import { join } from 'node:path';

import {
  ManualBatchReaderService,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';

/** One `keywords[]` entry of a curated batch file. */
export interface ManualRawKeywordEntry {
  name: string;
  kind: string;
  /** The entry's `tourplay.net` external id, null when it carries none. */
  code: string | null;
}

/**
 * Reads the hand-curated BB2025 keyword catalogue: the `keywords` section of
 * every curated batch under `<manual.dataDir>/batches/`, pooled by the shared
 * `ManualBatchReaderService` in batch-name order and, within a batch, filename
 * order -- the order tools/import-manual applies them in. When a later batch
 * restates a keyword with the same external-id set, the later entry wins, in
 * the earlier one's place. The shared reader only walks, parses and pools the
 * files; shaping each keyword entry happens here. Deliberately independent of
 * `tools/import-manual`: it shapes the entries itself, running none of that
 * importer's processor logic -- that logic's reading of these files is part of
 * what this tool exists to check.
 *
 * A missing or malformed file degrades to an empty list (via the shared
 * reader), so a broken curated file shows up as an empty raw sub-panel rather than failing the run.
 */
@Injectable()
export class ManualRawKeywordsService {
  constructor(
    private readonly config: ReviewPlayerConfigService,
    private readonly batches: ManualBatchReaderService,
  ) {}

  async all(): Promise<ManualRawKeywordEntry[]> {
    const keywords = await this.batches.section(
      join(this.config.getDataDir('manual'), 'batches'),
      'keywords',
    );
    const entries = keywords.flatMap((entry) => {
      const name = this.string(entry, 'name');
      const kind = this.string(entry, 'kind');
      if (name === null || kind === null) {
        return [];
      }
      return [
        {
          key: this.idsKey(entry),
          keyword: { name, kind, code: this.tourplayCode(entry) },
        },
      ];
    });
    return this.batches
      .latestByKey(entries, (e) => e.key)
      .map((e) => e.keyword);
  }

  /** An entry's `tourplay.net` external id, or null when it carries none. */
  private tourplayCode(entry: unknown): string | null {
    for (const ref of this.externalIds(entry)) {
      const system = this.string(ref, 'system');
      const id = this.property(ref, 'id');
      if (
        system === TP_EXTERNAL_SYSTEM_NAME &&
        (typeof id === 'string' || typeof id === 'number')
      ) {
        return String(id);
      }
    }
    return null;
  }

  /** An entry's identity by its external ids: '' when it has none. */
  private idsKey(entry: unknown): string {
    return this.externalIds(entry)
      .flatMap((ref) => {
        const system = this.string(ref, 'system');
        const id = this.property(ref, 'id');
        return system !== null &&
          (typeof id === 'string' || typeof id === 'number')
          ? [`${system}|${String(id)}`]
          : [];
      })
      .sort()
      .join(',');
  }

  private externalIds(entry: unknown): unknown[] {
    const raw = this.property(entry, 'externalIds');
    return Array.isArray(raw) ? raw : [];
  }

  private string(value: unknown, key: string): string | null {
    const property = this.property(value, key);
    return typeof property === 'string' && property !== '' ? property : null;
  }

  private property(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }
}
