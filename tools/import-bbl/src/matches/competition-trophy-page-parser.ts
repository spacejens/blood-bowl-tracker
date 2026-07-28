import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page.types';

/** e.g. `self.location.href='default.asp?p=tm&t=sew';` */
const TEAM_LINK = /default\.asp\?p=tm&t=([^'"]+)/;

/**
 * The placement each label suffix denotes. Labels are prefixed by the
 * competition's own trophy type ("Major 1st", "Minor 1st"), so only the
 * suffix is matched. "Wooden Spoon" (last place) and named awards
 * ("Cabal Vision Cup") are deliberately absent: they say nothing about who
 * won a specific match.
 */
const PLACEMENT_SUFFIXES = [
  ['1st', 'first'],
  ['2nd', 'second'],
  ['3rd', 'third'],
] as const;

export interface CompetitionTrophyPlacements {
  first?: string;
  second?: string;
  third?: string;
}

/**
 * Reads a competition results page's ("Team trophy") placement table
 * (`p=sr&s=<id>`): the source's own statement of who finished 1st, 2nd and
 * 3rd. It is the only signal BBL offers for a knock-out match that ended
 * level on touchdowns — for a final, 1st beat 2nd; for a bronze match, 3rd
 * beat the other participant.
 *
 * A page may carry no such table at all (confirmed for "Ogretoberfest 6"),
 * in which case every field is absent and the caller falls back to a
 * configured result override — never to a guess.
 *
 * A placement claimed by two different teams (possible in principle when a
 * page lists both "Major" and "Minor" trophies) is dropped rather than
 * arbitrarily resolved, for the same reason.
 */
@Injectable()
export class CompetitionTrophyPageParser {
  extractPlacements(page: BblPage): CompetitionTrophyPlacements {
    const $ = page.load();
    const table = $('table.tblist')
      .filter((_index, el) => $(el).find('th').text().includes('Team trophy'))
      .first();
    if (table.length === 0) {
      return {};
    }

    const codesByPlacement = new Map<string, Set<string>>();
    table.find('tr.trlist').each((_index, rowEl) => {
      const row = $(rowEl);
      const link = TEAM_LINK.exec(row.attr('onclick') ?? '');
      if (!link) {
        return;
      }
      const label = row.find('td').text();
      const placement = PLACEMENT_SUFFIXES.find(([suffix]) =>
        new RegExp(`\\b${suffix}\\b`).test(label),
      )?.[1];
      if (placement === undefined) {
        return;
      }
      const codes = codesByPlacement.get(placement) ?? new Set<string>();
      codes.add(link[1].normalize('NFC'));
      codesByPlacement.set(placement, codes);
    });

    const placements: CompetitionTrophyPlacements = {};
    for (const [placement, codes] of codesByPlacement) {
      if (codes.size === 1) {
        placements[placement as keyof CompetitionTrophyPlacements] = [
          ...codes,
        ][0];
      }
    }
    return placements;
  }
}
