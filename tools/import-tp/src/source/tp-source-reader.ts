import { join } from 'node:path';

import type { TpFileKind } from '@blood-bowl-tracker/read-tp-files';
import {
  TpFileNameService,
  TpFilesReaderService,
} from '@blood-bowl-tracker/read-tp-files';
import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import { SourceConfigService } from './source-config.service';

export interface TpSourceFile {
  /** The era's configured display name (EraDataConfig.name). */
  era: string;
  /** The competition subdirectory name under the era directory. */
  competition: string;
  /** read-tp-files' classification of the filename. */
  type: TpFileKind['kind'];
  filename: string;
  /** The JSON.parse'd file body. */
  content: unknown;
}

@Injectable()
export class TpSourceReader {
  constructor(
    private readonly sourceConfig: SourceConfigService,
    private readonly eraConfig: EraDataConfigService,
    private readonly tpFiles: TpFilesReaderService,
    private readonly names: TpFileNameService,
  ) {}

  /**
   * True for a base tournament file `tournament_<slug>.json`, the one with
   * no subpage. Shared by the eras and competitions importers.
   */
  isBaseTournamentFile(filename: string): boolean {
    const kind = this.names.classify(filename);
    return kind.kind === 'tournament' && kind.subpage === null;
  }

  /**
   * Stream every `.json` file under each configured era's data subdirectory,
   * one at a time. Layout: `<dataDir>/<era.dataSubdir>/<competition>/*.json`.
   * Files are visited in sorted order. Each file's body is JSON-parsed on
   * read; only one file is held at a time.
   */
  files(): AsyncIterable<TpSourceFile> {
    return this.walk();
  }

  /**
   * Like {@link files}, but yields only files whose type (read-tp-files'
   * classification of the filename) is `type`, or is one of `type` when given as a
   * list. Non-matching files are skipped before they are read, so a caller
   * that needs a subset of file types -- the awards import needs only
   * `awards`, the skill-master-name scan needs `rosters` and `match` -- does
   * not pay to read and JSON-parse every file in the mirror a second time.
   */
  filesOfType(
    type: TpFileKind['kind'] | readonly TpFileKind['kind'][],
  ): AsyncIterable<TpSourceFile> {
    return this.walk(typeof type === 'string' ? [type] : type);
  }

  private async *walk(
    types?: readonly TpFileKind['kind'][],
  ): AsyncIterable<TpSourceFile> {
    const dataDir = this.sourceConfig.getDataDir();
    const present = new Set(await this.tpFiles.listEras(dataDir));
    for (const era of this.eraConfig.getEras()) {
      if (!present.has(era.dataSubdir)) {
        throw new Error(
          `Era data directory not found: ${join(dataDir, era.dataSubdir)} (configured for era "${era.name}").`,
        );
      }
      const competitions = await this.tpFiles.listCompetitions(
        dataDir,
        era.dataSubdir,
      );
      for (const competition of competitions) {
        const filenames = await this.tpFiles.listFiles(
          dataDir,
          era.dataSubdir,
          competition,
        );
        for (const filename of filenames) {
          const type = this.names.classify(filename).kind;
          if (types !== undefined && !types.includes(type)) {
            continue;
          }
          const file = await this.tpFiles.readJson(dataDir, [
            era.dataSubdir,
            competition,
            filename,
          ]);
          if (file !== null) {
            yield {
              era: era.name,
              competition,
              type,
              filename,
              content: file.content,
            };
          }
        }
      }
    }
  }
}
