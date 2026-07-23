import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';
import { normalizeExtractedText } from '../source/normalize-extracted-text';

/** A competition's id/name read off the master dropdown on an se/sr page. */
export interface BblCompetition {
  bblId: string;
  name: string;
}

// Matches an option value like `default.asp?p=se&s=73`.
const SE_OPTION = /[?&]p=se&s=(\d+)/;

@Injectable()
export class CompetitionListPageParser {
  /**
   * Extract every competition from the master dropdown embedded on any se/sr
   * page: `<option value="default.asp?p=se&s=<id>"><name></option>`. The same
   * complete id/name list appears on every se/sr page, so one page is enough.
   * Options that are not `p=se` competition links (e.g. sort selectors) and
   * options with an empty name are ignored; ids are deduplicated.
   */
  extractCompetitions(page: BblPage): BblCompetition[] {
    const $ = page.load();
    const competitions: BblCompetition[] = [];
    const seen = new Set<string>();

    $('option').each((_index, element) => {
      const value = $(element).attr('value') ?? '';
      const match = SE_OPTION.exec(value);
      if (!match) {
        return;
      }
      const bblId = match[1];
      const name = normalizeExtractedText($(element).text());
      if (!name || seen.has(bblId)) {
        return;
      }
      seen.add(bblId);
      competitions.push({ bblId, name });
    });

    return competitions;
  }
}
