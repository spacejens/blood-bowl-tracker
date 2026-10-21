import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

/**
 * The mechanical half of reading the hand-curated data batches that
 * tools/import-manual applies: every batch directory under a `batches/`
 * directory in name order, each of its `.json5` files in name order, and every
 * top-level array section pooled across them in that order. It interprets no
 * entry -- each review tool shapes the pooled entries itself, so a tool's
 * reading of the curated data stays independent of the importer it checks.
 *
 * A missing directory, or an unreadable, malformed or non-object file, counts
 * as empty, so one broken curated file shows up as an empty raw sub-panel
 * rather than failing the run.
 */
@Injectable()
export class ManualBatchReaderService {
  private readonly pooled = new Map<string, Promise<Map<string, unknown[]>>>();

  /**
   * Every entry of one top-level section, across every batch under
   * `batchesDir`, in order. Each `batchesDir` is read once per process.
   */
  async section(batchesDir: string, key: string): Promise<unknown[]> {
    let pooled = this.pooled.get(batchesDir);
    if (pooled === undefined) {
      pooled = this.loadBatches(batchesDir);
      this.pooled.set(batchesDir, pooled);
    }
    return (await pooled).get(key) ?? [];
  }

  /**
   * One entry per key, the last one read winning in the first one's place.
   * An entry whose key is '' has no identity to match on, so it is always
   * kept.
   */
  latestByKey<T>(entries: T[], keyOf: (entry: T) => string): T[] {
    const byKey = new Map<string, T>();
    entries.forEach((entry, index) => {
      const key = keyOf(entry);
      byKey.set(key === '' ? `#${index}` : key, entry);
    });
    return [...byKey.values()];
  }

  /** Every top-level array section of every `.json5` file of every batch. */
  private async loadBatches(root: string): Promise<Map<string, unknown[]>> {
    const pooled = new Map<string, unknown[]>();
    for (const batch of await this.names(root, (e) => e.isDirectory())) {
      const dir = join(root, batch);
      for (const file of await this.names(dir, (e) =>
        e.name.endsWith('.json5'),
      )) {
        const contents = await this.load(join(dir, file));
        for (const [key, value] of Object.entries(contents)) {
          if (Array.isArray(value)) {
            pooled.set(key, [
              ...(pooled.get(key) ?? []),
              ...(value as unknown[]),
            ]);
          }
        }
      }
    }
    return pooled;
  }

  /** The sorted names of `dir`'s entries passing `keep`; none if unreadable. */
  private async names(
    dir: string,
    keep: (entry: Dirent) => boolean,
  ): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter(keep)
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  /** One file, JSON5-parsed; {} when it is missing, malformed or no object. */
  private async load(path: string): Promise<Record<string, unknown>> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      return {};
    }
    try {
      const parsed: unknown = JSON5.parse(raw);
      return typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
