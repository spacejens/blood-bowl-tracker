import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';

const KEYWORDS_FILE = join('before-other-importers', 'keywords.json5');

/** The external-id system the curated keyword catalogue keys its TP code by. */
const TOURPLAY_SYSTEM = 'tourplay.net';

/** One `keywords[]` entry of `keywords.json5`. */
export interface ManualRawKeywordEntry {
  name: string;
  kind: string;
  /** The entry's `tourplay.net` external id, null when it carries none. */
  code: string | null;
}

/**
 * Reads the hand-curated BB2025 keyword catalogue at
 * `<manual.dataDir>/before-other-importers/keywords.json5`. This tool has no
 * `manual-raw-data.service.ts` of its own (unlike `tools/review-race`), so
 * this is a small, single-purpose reader rather than a multi-file one.
 * Deliberately independent of `tools/import-manual`: it reads and shapes the
 * file itself, running none of that importer's processor logic -- that
 * logic's reading of this file is part of what this tool exists to check.
 *
 * A missing or malformed file degrades to an empty list, so a broken curated
 * file shows up as an empty raw sub-panel rather than failing the run.
 */
@Injectable()
export class ManualRawKeywordsService {
  private file: Promise<Record<string, unknown>> | undefined;

  constructor(private readonly config: ReviewPlayerConfigService) {}

  async all(): Promise<ManualRawKeywordEntry[]> {
    const contents = await this.contents();
    const raw = contents.keywords;
    const entries = Array.isArray(raw) ? raw : [];
    return entries.flatMap((entry) => {
      const name = this.string(entry, 'name');
      const kind = this.string(entry, 'kind');
      if (name === null || kind === null) {
        return [];
      }
      return [{ name, kind, code: this.tourplayCode(entry) }];
    });
  }

  /** An entry's `tourplay.net` external id, or null when it carries none. */
  private tourplayCode(entry: unknown): string | null {
    const raw = this.property(entry, 'externalIds');
    const refs = Array.isArray(raw) ? raw : [];
    for (const ref of refs) {
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

  private string(value: unknown, key: string): string | null {
    const property = this.property(value, key);
    return typeof property === 'string' && property !== '' ? property : null;
  }

  private property(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }

  /** Read and JSON5-parse the curated file, once per process. */
  private contents(): Promise<Record<string, unknown>> {
    this.file ??= this.load();
    return this.file;
  }

  private async load(): Promise<Record<string, unknown>> {
    const path = join(this.config.getDataDir('manual'), KEYWORDS_FILE);
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
