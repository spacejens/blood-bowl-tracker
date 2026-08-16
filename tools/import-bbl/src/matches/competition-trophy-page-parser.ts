import { Injectable } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';

import type { BblPage } from '../source/bbl-page.types';

/** e.g. `self.location.href='default.asp?p=tm&t=sew';` */
const TEAM_LINK = /default\.asp\?p=tm&t=([^'"]+)/;

/** e.g. `self.location.href='default.asp?p=pl&pid=102';` */
const PLAYER_LINK = /default\.asp\?p=pl&pid=([^'"]+)/;

/**
 * The placement each label suffix denotes. Labels are prefixed by the
 * competition's own trophy type ("Major 1st", "Minor 1st"), so only the
 * suffix is matched. "Wooden Spoon" (last place) and named awards
 * ("Cabal Vision Cup") are deliberately absent: they say nothing about who
 * won a specific match. They ARE still returned by `extractRows` — they are
 * real trophies, just not placement signals.
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

/** One "Team trophy" row: its exact label text and the winning team's code. */
export interface CompetitionTeamTrophyRow {
  label: string;
  teamCode: string;
}

/** One "Player prize" row: its exact label text and the winning player's pid. */
export interface CompetitionPlayerPrizeRow {
  label: string;
  pid: string;
}

/** Every award row a competition results page lists, in page order. */
export interface CompetitionTrophyRows {
  teamTrophies: CompetitionTeamTrophyRow[];
  playerPrizes: CompetitionPlayerPrizeRow[];
}

/**
 * Reads a competition results page (`p=sr&s=<id>`): its "Team trophy" table
 * (season placements plus named team awards) and its "Player prize" table.
 *
 * Labels are returned exactly as BBL prints them ("Major 1st", "Major Wooden
 * Spoon", "Cabal Vision Cup", "Bierhallenführer"), because that text is the
 * trophy's `tloeg.bbleague.se` external id in the curated catalog.
 *
 * A page may carry neither table (confirmed for "Ogretoberfest 6"), in which
 * case both lists come back empty.
 *
 * The same trophy label may legitimately appear on several rows: a player
 * prize tied between 2-4 players is one row per player. No cutoff is applied.
 */
@Injectable()
export class CompetitionTrophyPageParser {
  extractRows(page: BblPage): CompetitionTrophyRows {
    const $ = page.load();
    return {
      teamTrophies: this.rows($, 'Team trophy', TEAM_LINK).map(
        ([label, teamCode]) => ({ label, teamCode }),
      ),
      playerPrizes: this.rows($, 'Player prize', PLAYER_LINK).map(
        ([label, pid]) => ({ label, pid }),
      ),
    };
  }

  /**
   * The source's own statement of who finished 1st, 2nd and 3rd, derived from
   * the full team-trophy row list. It is the only signal BBL offers for a
   * knock-out match that ended level on touchdowns — for a final, 1st beat
   * 2nd; for a bronze match, 3rd beat the other participant.
   *
   * A placement claimed by two different teams (possible in principle when a
   * page lists both "Major" and "Minor" trophies) is dropped rather than
   * arbitrarily resolved.
   */
  placementsFrom(
    rows: readonly CompetitionTeamTrophyRow[],
  ): CompetitionTrophyPlacements {
    const codesByPlacement = new Map<string, Set<string>>();
    for (const row of rows) {
      const placement = PLACEMENT_SUFFIXES.find(([suffix]) =>
        new RegExp(`\\b${suffix}\\b`).test(row.label),
      )?.[1];
      if (placement === undefined) {
        continue;
      }
      const codes = codesByPlacement.get(placement) ?? new Set<string>();
      codes.add(row.teamCode);
      codesByPlacement.set(placement, codes);
    }

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

  /**
   * Every `[label, linkedId]` pair in the `table.tblist` whose header names
   * `heading`. Cell 0 is the prize icon and cell 1 is the label; the label's
   * trailing `&nbsp;` is stripped and the text normalized to NFC, matching
   * how team codes are already treated. A row with no matching link is
   * skipped.
   */
  private rows(
    $: CheerioAPI,
    heading: string,
    linkPattern: RegExp,
  ): [string, string][] {
    const table = $('table.tblist')
      .filter((_index, el) => $(el).find('th').text().includes(heading))
      .first();
    const found: [string, string][] = [];
    if (table.length === 0) {
      return found;
    }
    table.find('tr.trlist').each((_index, rowEl) => {
      const row = $(rowEl);
      const link = linkPattern.exec(row.attr('onclick') ?? '');
      if (!link) {
        return;
      }
      const label = row
        .find('td')
        .eq(1)
        .text()
        // cheerio decodes the label's trailing `&nbsp;` to U+00A0, which
        // `trim()` does not strip. This replace is global, so it would also
        // rewrite an interior NBSP if a label ever had one, but none in the
        // mirrored data do, and BBL is a frozen, final export that will never
        // add one, so this has no real effect today.
        .replace(/\u00a0/g, ' ')
        .trim()
        .normalize('NFC');
      if (label === '') {
        return;
      }
      found.push([label, link[1].normalize('NFC')]);
    });
    return found;
  }
}
