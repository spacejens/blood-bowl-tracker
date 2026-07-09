import { Injectable } from '@nestjs/common';
import type { BblPage } from '../source/bbl-page';

/**
 * A race extracted from BBL source data. `id` is the race's numeric BBL
 * identifier (used as its BBL external ID); `name` is its display name (used
 * as its Name external ID).
 */
export interface BblRace {
  id: string;
  name: string;
}

@Injectable()
export class RacePageParser {
  /**
   * Extract the race from a team page (`p=tm`). The `<td>` following the `<td>`
   * whose text is `Race:` holds the name as a link to the race's team-list
   * entry, `default.asp?p=tl#<id>`; the `name` is the cell text and the `id` is
   * that link's numeric fragment. Returns null when the page has no race field,
   * the value is empty, or the value has no link to derive an id from.
   */
  extractRace(page: BblPage): BblRace | null {
    const $ = page.load();
    let race: BblRace | null = null;

    $('td').each((_index, element) => {
      if ($(element).text().trim() === 'Race:') {
        const cell = $(element).next('td');
        // trim() strips the leading `&nbsp;` (U+00A0) and surrounding
        // whitespace; the name itself is preserved exactly.
        const name = cell.text().trim();
        const href = cell.find('a').attr('href') ?? '';
        const idMatch = /#(\d+)/.exec(href);
        if (name && idMatch) {
          race = { id: idMatch[1], name };
          return false;
        }
      }
      return undefined;
    });

    return race;
  }
}
