import type { Dirent } from 'node:fs';
import { readdir, readFile as readFileBytes } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

/** A filename that could escape the data directory it is resolved against. */
const UNSAFE_FILENAME = /[/\\]|^\.\.$/;

/**
 * BBL pages declare `charset=iso-8859-1` but are really Windows-1252: bytes
 * 0x80-0x9F carry curly quotes, dashes, the ellipsis and similar characters,
 * which an ISO-8859-1 decode turns into invisible C1 control characters.
 * The WHATWG Windows-1252 decoder maps every byte to a code point, so it
 * never throws; the five bytes Windows-1252 leaves undefined (0x81, 0x8D,
 * 0x8F, 0x90, 0x9D) decode to the C1 control of the same value.
 */
const WINDOWS_1252 = new TextDecoder('windows-1252');

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
    return WINDOWS_1252.decode(buffer);
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
