import { Injectable } from '@nestjs/common';
import type { BblPage } from '../source/bbl-page';

/** A race extracted from BBL source data. Identified solely by name. */
export interface BblRace {
  name: string;
}

@Injectable()
export class RacePageParser {
  /**
   * Extract the race from a team page (`p=tm`). The race name is the text of
   * the `<td>` following the `<td>` whose text is `Race:`. Returns null when
   * the page has no race field or the value is empty.
   */
  extractRace(page: BblPage): BblRace | null {
    const $ = page.load();
    let name: string | null = null;

    $('td').each((_index, element) => {
      if ($(element).text().trim() === 'Race:') {
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
