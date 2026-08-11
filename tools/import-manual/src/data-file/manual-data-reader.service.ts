import { readdir, readFile } from 'node:fs/promises';
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
   */
  async read(dir: string): Promise<ManualDataFile> {
    const entries = await readdir(dir, { withFileTypes: true });
    const filenames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json5'))
      .map((entry) => entry.name)
      .sort();

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
