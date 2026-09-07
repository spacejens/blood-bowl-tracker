import type { Dirent } from 'node:fs';
import { readdir, readFile as readFileBytes } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

/** A filename that could escape the data directory it is resolved against. */
const UNSAFE_FILENAME = /[/\\]|^\.\.$/;

/**
 * Reads files out of a BBL wget mirror directory. Mirror filenames encode
 * their query string verbatim (`default.asp?p=tl`), so a page is normally
 * addressed directly rather than by scanning; `listFiles` exists for the
 * sweeps that do need a directory listing.
 *
 * Deliberately mechanical: locating, listing and byte-decoding only. Which
 * files matter, what their names mean, and how their contents are parsed all
 * stay with the caller — nothing here knows anything about BBL page types or
 * HTML.
 */
@Injectable()
export class BblMirrorReaderService {
  /** One mirror file's text, or null when it is not in the mirror. */
  async readFile(dataDir: string, filename: string): Promise<string | null> {
    if (UNSAFE_FILENAME.test(filename)) {
      // Rejects anything that could address a file outside the given data
      // directory before it reaches a path join.
      return null;
    }
    let buffer: Buffer;
    try {
      buffer = await readFileBytes(join(dataDir, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
    // ISO-8859-1 maps every byte to a code point, so decoding never throws on
    // the mirror's stray/extended-ASCII bytes. `Buffer#toString('latin1')` is
    // a true byte-preserving decode; `TextDecoder`'s `'latin1'` label is
    // actually an alias for Windows-1252 per the WHATWG Encoding Standard,
    // which remaps bytes 0x80-0x9F to different characters instead of
    // preserving them.
    return buffer.toString('latin1');
  }

  /**
   * Every file in the mirror directory, in whatever order the filesystem
   * reports; empty when the directory is absent. Callers do their own
   * filtering and sorting.
   */
  async listFiles(dataDir: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(dataDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  }
}
