import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { RaceReviewConfigService } from '../config/review-race-config.service';

/** `default.asp?p=tm&t=<code>` — one BBL team page in the wget mirror. */
const TEAM_PAGE_FILENAME = /^default\.asp\?p=tm&t=[^/\\]+$/;

/** A filename that could escape the configured data directory. */
const UNSAFE_FILENAME = /[/\\]|(^|[/\\])\.\.($|[/\\])/;

/**
 * Reads files out of the BBL wget mirror. Mirror filenames encode their query
 * string verbatim (`default.asp?p=tl`), so a page is addressed directly rather
 * than by scanning; only the team-page sweep needs a directory listing.
 *
 * Deliberately does no parsing beyond the byte decode: the interpretation of
 * these pages is exactly what the report exists to check, so nothing here is
 * shared with tools/import-bbl.
 */
@Injectable()
export class BblMirrorReaderService {
  constructor(private readonly config: RaceReviewConfigService) {}

  /** One mirror file's text, or null when it is not in the mirror. */
  async readPage(filename: string): Promise<string | null> {
    if (UNSAFE_FILENAME.test(filename)) {
      // Rejects anything that could address a file outside the configured
      // data directory before it reaches a path join.
      return null;
    }
    let buffer: Buffer;
    try {
      buffer = await readFile(join(this.config.getDataDir('bbl'), filename));
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
    // which remaps bytes 0x80-0x9F to different characters instead.
    return buffer.toString('latin1');
  }

  /** Every team page in the mirror, sorted; empty when the dir is absent. */
  async listTeamPageFilenames(): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.config.getDataDir('bbl'), {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    return entries
      .filter((entry) => entry.isFile() && TEAM_PAGE_FILENAME.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  }
}
