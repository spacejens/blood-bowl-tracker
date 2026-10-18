import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';

/** The external-id system the curated keyword catalogue keys its TP code by. */
const TOURPLAY_SYSTEM = 'tourplay.net';

/** One `keywords[]` entry of a curated batch file. */
export interface ManualRawKeywordEntry {
  name: string;
  kind: string;
  /** The entry's `tourplay.net` external id, null when it carries none. */
  code: string | null;
}

/**
 * Reads the hand-curated BB2025 keyword catalogue: the `keywords` section of
 * every `.json5` file in every batch under `<manual.dataDir>/batches/`,
 * pooled in batch-name order and, within a batch, filename order -- the order
 * tools/import-manual applies them in. When a later batch restates a keyword
 * with the same external-id set, the later entry wins, in the earlier one's
 * place. This tool has no `manual-raw-data.service.ts` of its own (unlike
 * `tools/review-race`), so this is a small, single-purpose reader.
 * Deliberately independent of `tools/import-manual`: it reads and shapes the
 * files itself, running none of that importer's processor logic -- that
 * logic's reading of these files is part of what this tool exists to check.
 *
 * A missing or malformed file degrades to an empty list, so a broken curated
 * file shows up as an empty raw sub-panel rather than failing the run.
 */
@Injectable()
export class ManualRawKeywordsService {
  private pooled: Promise<unknown[]> | undefined;

  constructor(private readonly config: ReviewPlayerConfigService) {}

  async all(): Promise<ManualRawKeywordEntry[]> {
    const entries = (await this.keywords()).flatMap((entry) => {
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
    return this.latestByKey(entries, (e) => e.key).map((e) => e.keyword);
  }

  /** An entry's `tourplay.net` external id, or null when it carries none. */
  private tourplayCode(entry: unknown): string | null {
    for (const ref of this.externalIds(entry)) {
      const system = this.string(ref, 'system');
      const id = this.property(ref, 'id');
      if (
        system === TOURPLAY_SYSTEM &&
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

  /**
   * One entry per key, the last one read winning in the first one's place.
   * An entry whose key is '' (no external ids) has no identity to match on,
   * so it is always kept.
   */
  private latestByKey<T>(entries: T[], keyOf: (entry: T) => string): T[] {
    const byKey = new Map<string, T>();
    entries.forEach((entry, index) => {
      const key = keyOf(entry);
      byKey.set(key === '' ? `#${index}` : key, entry);
    });
    return [...byKey.values()];
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

  /** Every `keywords` entry of every batch, read once per process. */
  private keywords(): Promise<unknown[]> {
    this.pooled ??= this.loadBatches();
    return this.pooled;
  }

  private async loadBatches(): Promise<unknown[]> {
    const root = join(this.config.getDataDir('manual'), 'batches');
    const pooled: unknown[] = [];
    for (const batch of await this.names(root, (e) => e.isDirectory())) {
      const dir = join(root, batch);
      for (const file of await this.names(dir, (e) =>
        e.name.endsWith('.json5'),
      )) {
        const keywords = (await this.load(join(dir, file))).keywords;
        if (Array.isArray(keywords)) {
          pooled.push(...(keywords as unknown[]));
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
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
