import {
  TpFileNameService,
  TpFilesReaderService,
} from '@blood-bowl-tracker/read-tp-files';
import { Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';

/** Where a match file sits under the data directory. */
interface MatchFileLocation {
  era: string;
  competition: string;
  name: string;
}

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
  private index: Promise<Map<string, MatchFileLocation>> | undefined;

  constructor(
    private readonly config: ReviewMatchConfigService,
    private readonly tpFiles: TpFilesReaderService,
    private readonly names: TpFileNameService,
  ) {}

  /**
   * The raw parsed body of the match file, or null when there is none. TP's
   * match files are always JSON objects, never a bare primitive, so `object`
   * expresses the contract without the `unknown | null` redundancy a bare
   * `unknown` would need suppressing.
   */
  async loadMatchFile(externalId: string): Promise<object | null> {
    const location = (await this.matchFileLocations()).get(externalId);
    if (location === undefined) {
      return null;
    }
    const file = await this.tpFiles.readJson(this.config.getDataDir('tp'), [
      location.era,
      location.competition,
      location.name,
    ]);
    return file?.content ?? null;
  }

  /** TP match id -> file location, built once per process. */
  private matchFileLocations(): Promise<Map<string, MatchFileLocation>> {
    this.index ??= this.buildIndex();
    return this.index;
  }

  private async buildIndex(): Promise<Map<string, MatchFileLocation>> {
    const locations = new Map<string, MatchFileLocation>();
    const dataDir = this.config.getDataDir('tp');
    for (const era of await this.tpFiles.listEras(dataDir)) {
      for (const competition of await this.tpFiles.listCompetitions(
        dataDir,
        era,
      )) {
        for (const name of await this.tpFiles.listFiles(
          dataDir,
          era,
          competition,
        )) {
          const kind = this.names.classify(name);
          if (kind.kind === 'match') {
            locations.set(kind.matchId, { era, competition, name });
          }
        }
      }
    }
    return locations;
  }
}
