import { Injectable } from '@nestjs/common';

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
 */
@Injectable()
export class NormalizeExtractedTextService {
  normalize(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}
