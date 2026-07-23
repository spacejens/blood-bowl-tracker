import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import type { BblRace } from './race-page-parser';

@Injectable()
export class RaceListPageParser {
  constructor(private readonly normalizeText: NormalizeExtractedTextService) {}

  /**
   * Extract every race from the single master race-list page (`p=tl`). Each
   * race is introduced by an anchor whose `name` is the race's numeric BBL id
   * (`<a name="48"></a>`, the same id used in `default.asp?p=tl#<id>` links),
   * immediately followed in document order by a `<b>` heading holding the race
   * name. Non-numeric anchors (e.g. the parallel name anchor), empty names, and
   * later roster `<b>` rows are ignored; a numeric anchor with no following
   * non-empty `<b>` is skipped rather than throwing.
   */
  extractRaces(page: BblPage): BblRace[] {
    const $ = page.load();
    const races: BblRace[] = [];
    let pendingId: string | null = null;

    $('a[name], b').each((_index, element) => {
      if ($(element).is('a')) {
        const name = $(element).attr('name') ?? '';
        if (/^\d+$/.test(name)) {
          pendingId = name;
        }
        return;
      }
      // element is a <b>: the first one after a numeric anchor is the race name.
      if (pendingId !== null) {
        const raceName = this.normalizeText.normalize($(element).text());
        if (raceName) {
          races.push({ id: pendingId, name: raceName });
        }
        pendingId = null;
      }
    });

    return races;
  }
}
