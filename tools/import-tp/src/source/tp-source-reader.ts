import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import { SourceConfigService } from './source-config.service';

export interface TpSourceFile {
  /** The era's configured display name (EraDataConfig.name). */
  era: string;
  /** The competition subdirectory name under the era directory. */
  competition: string;
  /** Filename text before the first `_`, or the whole basename if none. */
  type: string;
  filename: string;
  /** The JSON.parse'd file body. */
  content: unknown;
}

/** Filename text before the first `_`, or the basename (minus `.json`). */
function extractType(filename: string): string {
  const base = filename.replace(/\.json$/, '');
  const underscore = base.indexOf('_');
  return underscore === -1 ? base : base.slice(0, underscore);
}

@Injectable()
export class TpSourceReader {
  constructor(
    private readonly sourceConfig: SourceConfigService,
    private readonly eraConfig: EraDataConfigService,
  ) {}

  /**
   * Stream every `.json` file under each configured era's data subdirectory,
   * one at a time. Layout: `<dataDir>/<era.dataSubdir>/<competition>/*.json`.
   * Each file's body is JSON-parsed on read; only one file is held at a time.
   */
  async *files(): AsyncIterable<TpSourceFile> {
    const dataDir = this.sourceConfig.getDataDir();
    for (const era of this.eraConfig.getEras()) {
      const eraDir = join(dataDir, era.dataSubdir);
      let competitions;
      try {
        competitions = await readdir(eraDir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            `Era data directory not found: ${eraDir} (configured for era "${era.name}").`,
            { cause: error },
          );
        }
        throw error;
      }

      for (const competition of competitions) {
        if (!competition.isDirectory()) {
          continue;
        }
        const competitionDir = join(eraDir, competition.name);
        const entries = await readdir(competitionDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.json')) {
            continue;
          }
          const raw = await readFile(join(competitionDir, entry.name), 'utf8');
          const content: unknown = JSON.parse(raw);
          yield {
            era: era.name,
            competition: competition.name,
            type: extractType(entry.name),
            filename: entry.name,
            content,
          };
        }
      }
    }
  }
}
