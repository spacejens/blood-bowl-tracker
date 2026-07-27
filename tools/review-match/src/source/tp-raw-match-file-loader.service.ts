import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';

/** `match_<id>.json` — TP's per-match file, one per competition directory. */
const MATCH_FILENAME = /^match_(\d+)\.json$/;

/**
 * Locates and reads a single TP match file from the downloaded mirror, whose
 * layout is `<dataDir>/<era>/<competition>/match_<id>.json`.
 *
 * Only filenames are scanned (once, memoized); exactly one file is ever read
 * and parsed. Reading every file the way tools/import-tp's own reader does
 * would mean parsing the entire ~96 MB mirror to show a handful of matches.
 */
@Injectable()
export class TpRawMatchFileLoaderService {
  private index: Promise<Map<string, string>> | undefined;

  constructor(private readonly config: ReviewMatchConfigService) {}

  /** The raw parsed body of the match file, or null when there is none. */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  async loadMatchFile(externalId: string): Promise<unknown | null> {
    const path = (await this.matchFilePaths()).get(externalId);
    if (path === undefined) {
      return null;
    }
    const raw = await readFile(path, 'utf8');
    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Failed to parse TP match file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /** TP match id -> absolute file path, built once per process. */
  private matchFilePaths(): Promise<Map<string, string>> {
    this.index ??= this.buildIndex();
    return this.index;
  }

  private async buildIndex(): Promise<Map<string, string>> {
    const paths = new Map<string, string>();
    const dataDir = this.config.getDataDir('tp');
    for (const era of await this.subdirectories(dataDir)) {
      const eraDir = join(dataDir, era.name);
      for (const competition of await this.subdirectories(eraDir)) {
        const competitionDir = join(eraDir, competition.name);
        for (const entry of await this.entries(competitionDir)) {
          const matched = entry.isFile()
            ? MATCH_FILENAME.exec(entry.name)
            : null;
          if (matched) {
            paths.set(matched[1], join(competitionDir, entry.name));
          }
        }
      }
    }
    return paths;
  }

  private async subdirectories(dir: string): Promise<Dirent[]> {
    return (await this.entries(dir)).filter((entry) => entry.isDirectory());
  }

  /** Directory entries, or none when the directory is absent. */
  private async entries(dir: string): Promise<Dirent[]> {
    try {
      return await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
