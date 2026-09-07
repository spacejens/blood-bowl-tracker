import { BblMirrorReaderService as SharedBblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Injectable } from '@nestjs/common';

import { RaceReviewConfigService } from '../config/review-race-config.service';

/** `default.asp?p=tm&t=<code>` — one BBL team page in the wget mirror. */
const TEAM_PAGE_FILENAME = /^default\.asp\?p=tm&t=[^/\\]+$/;

/**
 * Reads files out of the BBL wget mirror. Mirror filenames encode their query
 * string verbatim (`default.asp?p=tl`), so a page is addressed directly rather
 * than by scanning; only the team-page sweep needs a directory listing.
 *
 * The mechanics — safe filename resolution, missing-file handling and the byte
 * decode — come from the shared reader package. Which files matter stays here:
 * this deliberately does no parsing, since the interpretation of these pages is
 * exactly what the report exists to check, and nothing here is shared with
 * tools/import-bbl.
 */
@Injectable()
export class BblMirrorReaderService {
  constructor(
    private readonly config: RaceReviewConfigService,
    private readonly mirror: SharedBblMirrorReaderService,
  ) {}

  /** One mirror file's text, or null when it is not in the mirror. */
  async readPage(filename: string): Promise<string | null> {
    return this.mirror.readFile(this.config.getDataDir('bbl'), filename);
  }

  /** Every team page in the mirror, sorted; empty when the dir is absent. */
  async listTeamPageFilenames(): Promise<string[]> {
    const filenames = await this.mirror.listFiles(
      this.config.getDataDir('bbl'),
    );
    return filenames.filter((name) => TEAM_PAGE_FILENAME.test(name)).sort();
  }
}
