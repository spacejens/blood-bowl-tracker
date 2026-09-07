import { BblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Injectable } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';

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
    return this.mirror.readFile(
      this.config.getDataDir('bbl'),
      `default.asp?p=pl&pid=${externalId}`,
    );
  }
}
