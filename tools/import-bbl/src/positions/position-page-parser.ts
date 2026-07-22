import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';

/** One race a position can play for: its numeric BBL id and display name. */
interface BblPositionRace {
  bblId: string;
  name: string;
}

/**
 * A position ("player type") extracted from a `p=pt` page. `typId` is the
 * position's own numeric BBL id (the page's `typID` param); `name` is the
 * `<h1>` display name; `races` are the races listed under "Can play for:";
 * `isStarPlayer` indicates whether the skill-improvement-categories cell
 * contains the literal text "None (star player)".
 */
export interface BblPosition {
  typId: string;
  name: string;
  races: BblPositionRace[];
  isStarPlayer: boolean;
}

@Injectable()
export class PositionPageParser {
  /**
   * Extract the position from a `p=pt` page. The name is the `<h1>` text; the
   * races are the "Can play for:" links, each `default.asp?p=tl#<raceId>` with
   * the race display name as its text (the same `p=tl#<id>` convention team
   * pages use for races). On a `pt` page those are the only `p=tl#` links, so
   * every such anchor is a listed race. Returns null when the page has no
   * `<h1>` name or the `typID` param is absent; returns an empty `races` array
   * when the position lists no race.
   */
  extractPosition(page: BblPage): BblPosition | null {
    const typId = page.params.typID ?? '';
    const $ = page.load();
    const name = $('h1').first().text().trim();
    if (!name || !typId) {
      return null;
    }

    const races: BblPositionRace[] = [];
    const seen = new Set<string>();
    $('a').each((_index, element) => {
      const href = $(element).attr('href') ?? '';
      const idMatch = /[?&]p=tl#(\d+)/.exec(href);
      if (!idMatch) {
        return;
      }
      const bblId = idMatch[1];
      const raceName = $(element).text().trim();
      if (!raceName || seen.has(bblId)) {
        return;
      }
      seen.add(bblId);
      races.push({ bblId, name: raceName });
    });

    let isStarPlayer = false;
    $('td').each((_index, element) => {
      if ($(element).text().trim() === 'None (star player)') {
        isStarPlayer = true;
        return false;
      }
      return undefined;
    });

    return { typId, name, races, isStarPlayer };
  }
}
