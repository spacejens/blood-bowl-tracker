import { BblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Injectable } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';

/** BBL's own player ids are always plain numbers (the `pid` page parameter). */
const NUMERIC_EXTERNAL_ID = /^\d+$/;

/**
 * Loads a single BBL player page off the wget mirror. Mirror filenames encode
 * their query string verbatim (`default.asp?p=pl&pid=1000`), so a player's
 * page is addressed directly rather than by scanning the directory.
 *
 * Deliberately does no parsing beyond the shared reader's byte decode: the
 * interpretation of these pages is exactly what the report exists to check.
 */
@Injectable()
export class BblRawPlayerPageLoaderService {
  constructor(
    private readonly config: ReviewPlayerConfigService,
    private readonly mirror: BblMirrorReaderService,
  ) {}

  async loadPlayerPage(externalId: string): Promise<string | null> {
    if (!NUMERIC_EXTERNAL_ID.test(externalId)) {
      // The shared reader's filename-safety check only rejects path
      // separators and "..", so a non-numeric id containing extra
      // characters (e.g. a query-string suffix) would otherwise compose a
      // filename that could address an unintended, unrelated mirror file.
      return null;
    }
    return this.mirror.readFile(
      this.config.getDataDir('bbl'),
      `default.asp?p=pl&pid=${externalId}`,
    );
  }
}
