import { Injectable } from '@nestjs/common';

/** Curly single quotes, including the low-9 and reversed forms. */
const CURLY_SINGLE_QUOTES = /[‘’‚‛]/g;

/** Curly double quotes, including the low-9 and reversed forms. */
const CURLY_DOUBLE_QUOTES = /[“”„‟]/g;

/**
 * Normalize a text value extracted from BBL's scraped HTML.
 *
 * Collapses every run of internal whitespace -- non-breaking spaces (U+00A0,
 * left over from `&nbsp;` entities cheerio decodes but does not fold into
 * plain spaces), tabs, repeated spaces, and other stray Unicode space
 * characters -- down to a single regular ASCII space, then trims the edges.
 *
 * This is what BBL text sites use instead of a bare `.trim()`. `.trim()` (and
 * JavaScript's `\s`) already strips *leading/trailing* U+00A0, but a
 * non-breaking space sitting *between* words survives it. That surviving
 * codepoint is invisible everywhere it is displayed yet breaks byte-level
 * equality, so a "Name" external id built from a corrupted race name never
 * matches its plain-space twin from another source.
 *
 * It also folds curly single quotes to `'` and curly double quotes to `"`.
 * BBL's Windows-1252 pages write apostrophes and quotes curly, while the
 * curated data and most TP names use straight ones, and Name external ids are
 * matched by exact string across sources. Dashes and ellipses are kept as
 * decoded. The `fix_bbl_windows_1252_text` migration applies the same quote
 * folding to stored values, so a change to the folding here needs a new data
 * migration for the rows already stored.
 */
@Injectable()
export class NormalizeExtractedTextService {
  normalize(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(CURLY_SINGLE_QUOTES, "'")
      .replace(CURLY_DOUBLE_QUOTES, '"');
  }
}
