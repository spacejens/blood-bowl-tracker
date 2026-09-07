import { BblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';

/** BBL's own external ids are always plain numbers (the `m=` page parameter). */
const NUMERIC_EXTERNAL_ID = /^\d+$/;

/**
 * Loads a single BBL match page off the wget mirror. Mirror filenames encode
 * their query string verbatim (`default.asp?p=m&m=1830`), so the file for a
 * given match id is addressed directly rather than by scanning the directory.
 *
 * Deliberately does no parsing beyond the shared reader's byte decode: the
 * interpretation of these pages is exactly what the report exists to check.
 */
@Injectable()
export class BblRawPageLoaderService {
  constructor(
    private readonly config: ReviewMatchConfigService,
    private readonly mirror: BblMirrorReaderService,
  ) {}

  async loadMatchPage(externalId: string): Promise<string | null> {
    if (!NUMERIC_EXTERNAL_ID.test(externalId)) {
      // The shared reader's filename-safety check only rejects path
      // separators and "..", so a non-numeric id containing extra
      // characters (e.g. a query-string suffix) would otherwise compose a
      // filename that could address an unintended, unrelated mirror file.
      return null;
    }
    return this.mirror.readFile(
      this.config.getDataDir('bbl'),
      `default.asp?p=m&m=${externalId}`,
    );
  }
}
