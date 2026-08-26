import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ReviewMatchConfigService } from '../config/review-match-config.service';

/** BBL's own external ids are always plain numbers (the `m=` page parameter). */
const NUMERIC_EXTERNAL_ID = /^\d+$/;

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
    if (!NUMERIC_EXTERNAL_ID.test(externalId)) {
      // Rejects anything that isn't a plain number before it reaches a path
      // join — a `/` or `..` here (never a real BBL id) could otherwise
      // address a file outside the configured data directory.
      return null;
    }
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
    // the mirror's extended-ASCII bytes. `Buffer#toString('latin1')` is a
    // true byte-preserving decode; `TextDecoder`'s `'latin1'` label is
    // actually an alias for Windows-1252 per the WHATWG Encoding Standard,
    // which remaps bytes 0x80-0x9F to different characters instead of
    // preserving them.
    return buffer.toString('latin1');
  }
}
