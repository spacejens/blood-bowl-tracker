import { BblMirrorReaderService as SharedBblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Injectable } from '@nestjs/common';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';

/** `default.asp?p=pt&typID=<n>` — one BBL position page in the wget mirror. */
const POSITION_PAGE_FILENAME = /^default\.asp\?p=pt&typID=\d+$/;

/**
 * Reads files out of the BBL wget mirror. Mirror filenames encode their query
 * string verbatim, so a page is addressed directly rather than by scanning;
 * only the star-page sweep (see `BblRawStarPlayerPageService`) needs a
 * directory listing.
 *
 * The mechanics — safe filename resolution, missing-file handling and the
 * byte decode — come from the shared reader package. Which files matter stays
 * here: this deliberately does no parsing, since the interpretation of these
 * pages is exactly what the report exists to check, and nothing here is
 * shared with tools/import-bbl.
 */
@Injectable()
export class BblMirrorReaderService {
  constructor(
    private readonly config: StarPlayerReviewConfigService,
    private readonly mirror: SharedBblMirrorReaderService,
  ) {}

  /** One mirror file's text, or null when it is not in the mirror. */
  async readPage(filename: string): Promise<string | null> {
    return this.mirror.readFile(this.config.getDataDir('bbl'), filename);
  }

  /** Every position page in the mirror, sorted; empty when the dir is absent. */
  async listPositionPageFilenames(): Promise<string[]> {
    const filenames = await this.mirror.listFiles(
      this.config.getDataDir('bbl'),
    );
    return filenames.filter((name) => POSITION_PAGE_FILENAME.test(name)).sort();
  }
}
