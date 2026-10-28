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
   * alphabetical filename order, and pool all sections into one
   * ManualDataFile. Malformed JSON5 or an invalid file shape throws with the
   * offending path; a missing directory propagates readdir's error.
   */
  async read(dir: string): Promise<ManualDataFile> {
    const pooled: ManualDataFile = {
      externalSystems: [],
      rulesSets: [],
      leagues: [],
      eras: [],
      races: [],
      positions: [],
      positionRulesSets: [],
      positionRulesSetSkills: [],
      skills: [],
      skillRulesSets: [],
      keywords: [],
      coaches: [],
      teams: [],
      competitions: [],
      sppAwardValues: [],
      advancementCosts: [],
      trophies: [],
      competitionGroups: [],
      trophyAwards: [],
    };

    for (const path of await this.listFiles(dir)) {
      const file = this.validate(
        path,
        this.parseJson5(path, await readFile(path, 'utf8')),
      );
      pooled.externalSystems.push(...file.externalSystems);
      pooled.rulesSets.push(...file.rulesSets);
      pooled.leagues.push(...file.leagues);
      pooled.eras.push(...file.eras);
      pooled.races.push(...file.races);
      pooled.positions.push(...file.positions);
      pooled.positionRulesSets.push(...file.positionRulesSets);
      pooled.positionRulesSetSkills.push(...file.positionRulesSetSkills);
      pooled.skills.push(...file.skills);
      pooled.skillRulesSets.push(...file.skillRulesSets);
      pooled.keywords.push(...file.keywords);
      pooled.coaches.push(...file.coaches);
      pooled.teams.push(...file.teams);
      pooled.competitions.push(...file.competitions);
      pooled.sppAwardValues.push(...file.sppAwardValues);
      pooled.advancementCosts.push(...file.advancementCosts);
      pooled.trophies.push(...file.trophies);
      pooled.competitionGroups.push(...file.competitionGroups);
      pooled.trophyAwards.push(...file.trophyAwards);
    }

    return pooled;
  }

  /**
   * The same files as `read`, in the same order and validated the same way,
   * but returned as JSON5 parsed them -- before the schema adds any default
   * -- pooled section by section. A batch's content hash is computed over
   * this: parsing already drops comments and formatting, and leaving the
   * defaults out means a later schema change that adds a defaulted field
   * cannot change the hash of a batch applied before it.
   */
  async readRaw(dir: string): Promise<Record<string, unknown[]>> {
    const pooled: Record<string, unknown[]> = {};
    for (const path of await this.listFiles(dir)) {
      const parsed = this.parseJson5(path, await readFile(path, 'utf8'));
      this.validate(path, parsed);
      // validate() accepted it, so it is an object of section arrays.
      for (const [section, entries] of Object.entries(
        parsed as Record<string, unknown[]>,
      )) {
        (pooled[section] ??= []).push(...entries);
      }
    }
    return pooled;
  }

  /**
   * Every `.json5` file directly inside `dir`, as full paths in alphabetical
   * filename order.
   *
   * Symlinks count as files: `Dirent.isFile()` never follows them, so it
   * alone would silently skip a curated file that is a symlink to another
   * batch's copy -- a curated file can be exactly that, when two batches
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
  private async listFiles(dir: string): Promise<string[]> {
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
    return filenames.map((name) => join(dir, name));
  }

  private parseJson5(path: string, raw: string): unknown {
    try {
      return JSON5.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private validate(path: string, parsed: unknown): ManualDataFile {
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
