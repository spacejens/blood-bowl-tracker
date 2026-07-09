import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';

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
      if ($(element).text().trim() === 'Coach:') {
        // trim() strips the leading `&nbsp;` (U+00A0) and surrounding
        // whitespace; the name itself is preserved exactly.
        const value = $(element).next('td').text().trim();
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
