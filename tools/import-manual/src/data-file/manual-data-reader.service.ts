import type { Stats } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import type { ManualDataFile } from './manual-data-file.schema';
import { ManualDataFileSchema } from './manual-data-file.schema';

@Injectable()
export class ManualDataReader {
  /**
   * Read every `.json5` file directly inside `dir` (non-recursive), in
   * alphabetical filename order, and pool all sections into one ManualDataFile.
   * Malformed JSON5 or an invalid file shape throws with the offending path; a
   * missing directory propagates readdir's error.
   *
   * Symlinks count as files: `Dirent.isFile()` never follows them, so it
   * alone would silently skip a curated file that is a symlink to another
   * phase's copy -- a curated file can be exactly that, when two phases
   * need to reference the same catalog. `stat()` does follow symlinks, so
   * it is used instead to decide "is this path, after following any
   * symlink, actually a file" -- which also means a symlink to a
   * directory is skipped just like any other non-file entry, since `stat()`
   * succeeds for it and only `isFile()` is false. A broken symlink's target
   * doesn't exist, so `stat()` itself throws `ENOENT`; that specific error is
   * swallowed the same way, but any other `stat()` failure (a permission
   * error, an I/O error, a symlink loop) is a real problem the run should not
   * silently hide by skipping the file -- it propagates instead.
   */
  async read(dir: string): Promise<ManualDataFile> {
    const entries = await readdir(dir, { withFileTypes: true });
    const candidates = entries.filter((entry) => entry.name.endsWith('.json5'));
    const filenames: string[] = [];
    for (const entry of candidates) {
      const path = join(dir, entry.name);
      let stats: Stats;
      try {
        stats = await stat(path);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          continue;
        }
        throw error;
      }
      if (stats.isFile()) {
        filenames.push(entry.name);
      }
    }
    filenames.sort();

    const pooled: ManualDataFile = {
      externalSystems: [],
      rulesSets: [],
      leagues: [],
      eras: [],
      races: [],
      positions: [],
      coaches: [],
      teams: [],
      competitions: [],
      sppAwardValues: [],
      trophies: [],
      competitionGroups: [],
    };

    for (const name of filenames) {
      const path = join(dir, name);
      const file = this.parseFile(path, await readFile(path, 'utf8'));
      pooled.externalSystems.push(...file.externalSystems);
      pooled.rulesSets.push(...file.rulesSets);
      pooled.leagues.push(...file.leagues);
      pooled.eras.push(...file.eras);
      pooled.races.push(...file.races);
      pooled.positions.push(...file.positions);
      pooled.coaches.push(...file.coaches);
      pooled.teams.push(...file.teams);
      pooled.competitions.push(...file.competitions);
      pooled.sppAwardValues.push(...file.sppAwardValues);
      pooled.trophies.push(...file.trophies);
      pooled.competitionGroups.push(...file.competitionGroups);
    }

    return pooled;
  }

  private parseFile(path: string, raw: string): ManualDataFile {
    let parsed: unknown;
    try {
      parsed = JSON5.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const result = ManualDataFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid manual data file ${path}: ${result.error.message}`,
        { cause: result.error },
      );
    }
    return result.data;
  }
}
