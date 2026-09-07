import { BblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';

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
    return this.mirror.readFile(
      this.config.getDataDir('bbl'),
      `default.asp?p=m&m=${externalId}`,
    );
  }
}
