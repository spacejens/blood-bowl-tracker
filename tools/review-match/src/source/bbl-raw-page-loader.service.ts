import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';

/**
 * Loads a single BBL match page off the wget mirror. Mirror filenames encode
 * their query string verbatim (`default.asp?p=m&m=1830`), so the file for a
 * given match id is addressed directly rather than by scanning the directory.
 *
 * Deliberately does no parsing beyond the byte decode: the interpretation of
 * these pages is exactly what the report exists to check.
 */
@Injectable()
export class BblRawPageLoaderService {
  constructor(private readonly config: ReviewMatchConfigService) {}

  async loadMatchPage(externalId: string): Promise<string | null> {
    const path = join(
      this.config.getDataDir('bbl'),
      `default.asp?p=m&m=${externalId}`,
    );
    let buffer: Buffer;
    try {
      buffer = await readFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
    // ISO-8859-1 maps every byte to a code point, so decoding never throws on
    // the mirror's extended-ASCII bytes — same decode tools/import-bbl uses.
    return new TextDecoder('latin1').decode(buffer);
  }
}
