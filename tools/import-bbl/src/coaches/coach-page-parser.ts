import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';
import { normalizeExtractedText } from '../source/normalize-extracted-text';

/** A coach extracted from BBL source data. Identified solely by name. */
export interface BblCoach {
  name: string;
}

@Injectable()
export class CoachPageParser {
  /**
   * Extract the coach from a team page (`p=tm`). The coach name is the text of
   * the `<td>` following the `<td>` whose text is `Coach:`. Returns null when
   * the page has no coach field or the value is empty.
   */
  extractCoach(page: BblPage): BblCoach | null {
    const $ = page.load();
    let name: string | null = null;

    $('td').each((_index, element) => {
      if (normalizeExtractedText($(element).text()) === 'Coach:') {
        // normalizeExtractedText strips the leading `&nbsp;` (U+00A0) and
        // surrounding whitespace and collapses any internal whitespace to a
        // single ASCII space.
        const value = normalizeExtractedText($(element).next('td').text());
        if (value) {
          name = value;
          return false;
        }
      }
      return undefined;
    });

    return name === null ? null : { name };
  }
}
