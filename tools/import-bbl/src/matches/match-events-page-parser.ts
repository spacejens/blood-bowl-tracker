import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { MatchTeamsPageParser } from './match-teams-page-parser';

export type BblEventSide = 'home' | 'away';

interface BblActionOccurrence {
  actionType: ActionType;
  side: BblEventSide;
  pid: string | null;
  /**
   * Set (and only set) when this occurrence's `<br>`-delimited cell segment
   * carried the literal "foul by " marker before the causer's player link —
   * i.e. this casualty was caused by a foul rather than a block. The
   * occurrence's `actionType` still holds the row's severity tier, which is
   * what the correlation step matches on; the foul-ness only changes the
   * action type actually emitted. Omitted (rather than `false`) so ordinary
   * occurrences keep their existing exact shape.
   */
  viaFoul?: boolean;
}

interface BblConsequenceOccurrence {
  consequenceType: ConsequenceType;
  side: BblEventSide;
  pid: string | null;
}

export interface BblMatchEvents {
  bblId: string;
  homeTeamId: string;
  awayTeamId: string;
  actions: BblActionOccurrence[];
  consequences: BblConsequenceOccurrence[];
  journeymenCount?: { home: number; away: number };
}

const PID_LINK = /[?&]p=pl&pid=([^&#"']+)/;

/**
 * The literal text BBL puts before a causer's player link when the casualty
 * came from a foul, e.g. `foul by <a href="...">Eeeh-Gor</a>` (confirmed on
 * real mirrored pages, e.g. match 1830's "Badly Hurt'ers" cell). Matched
 * against the segment's text with player links and spacer images stripped and
 * whitespace normalized.
 */
const FOUL_MARKER = /^foul by$/i;

/** One player occurrence read out of a single side cell. */
interface CellOccurrence {
  pid: string | null;
  viaFoul?: boolean;
}

const ACTION_LABELS: { test: RegExp; actionType: ActionType }[] = [
  { test: /^TD Scorers$/i, actionType: 'touchdown' },
  { test: /^(TTM )?Completions by$/i, actionType: 'completion' },
  { test: /^Interceptions by$/i, actionType: 'interception' },
  { test: /^Deflections by$/i, actionType: 'deflection' },
  { test: /^Foulers/i, actionType: 'foul' },
  { test: /^Badly Hurt'?ers$/i, actionType: 'badly_hurt' },
  { test: /Hurters\/Injurers$/i, actionType: 'serious_injury' },
  { test: /^Killers$/i, actionType: 'death' },
  { test: /^MVP awards to$/i, actionType: 'mvp_award' },
];

// 'Sent off' is a consequence, not an action.
const SENT_OFF = /^Sent off$/i;

const CONSEQUENCE_LABELS: { test: RegExp; consequenceType: ConsequenceType }[] =
  [
    { test: /^Miss Next Game$/i, consequenceType: 'miss_next_game' },
    { test: /^Niggling Injury$/i, consequenceType: 'niggling_injury' },
    { test: /^-1 MA$/i, consequenceType: 'stat_reduction_ma' },
    { test: /^-1 ST$/i, consequenceType: 'stat_reduction_st' },
    { test: /^-1 AG$/i, consequenceType: 'stat_reduction_ag' },
    { test: /^-1 AV$/i, consequenceType: 'stat_reduction_av' },
    { test: /^-1 PA$/i, consequenceType: 'stat_reduction_pa' },
    { test: /^Death$/i, consequenceType: 'death' },
  ];

/**
 * Parses a match-detail page (`p=m&m=<id>`) into raw event occurrences: the
 * achievement rows (TD Scorers, Killers, etc.) and the "Sustained Injuries"
 * rows (Death, Miss Next Game, Niggling Injury, stat reductions). This is
 * intentionally shallow — no correlation across rows, no external-id
 * synthesis, no DB-id resolution. That happens downstream, once actions and
 * consequences for the same player/moment can be matched up.
 */
@Injectable()
export class MatchEventsPageParser {
  private readonly teamsParser: MatchTeamsPageParser;

  constructor(private readonly normalizeText: NormalizeExtractedTextService) {
    this.teamsParser = new MatchTeamsPageParser(normalizeText);
  }

  extractMatchEvents(page: BblPage): BblMatchEvents | null {
    const bblId = page.params.m?.trim();
    if (!bblId) {
      return null;
    }
    const teams = this.teamsParser.extractMatchTeams(page);
    if (!teams) {
      return null;
    }
    const $ = page.load();

    const actions: BblActionOccurrence[] = [];
    const consequences: BblConsequenceOccurrence[] = [];
    const journeymenFloor = { home: false, away: false };
    const journeymenRemoval = { home: 0, away: 0 };

    $('table.tblist tr').each((_i, tr) => {
      const cells = $(tr).find('td');
      if (cells.length !== 3) {
        return;
      }
      const label = this.normalizeText.normalize($(cells[1]).text());
      if (!label) {
        return;
      }
      const homeCell = $(cells[0]);
      const awayCell = $(cells[2]);

      for (const side of ['home', 'away'] as const) {
        const cell = side === 'home' ? homeCell : awayCell;
        if (
          this.normalizeText
            .normalize(cell.text())
            .toLowerCase()
            .includes('journeyman')
        ) {
          journeymenFloor[side] = true;
        }
      }
      const isRemovalRow =
        SENT_OFF.test(label) ||
        CONSEQUENCE_LABELS.some((c) => c.test.test(label));
      if (isRemovalRow) {
        journeymenRemoval.home += this.countJourneymenInCell($, homeCell);
        journeymenRemoval.away += this.countJourneymenInCell($, awayCell);
      }

      const action = ACTION_LABELS.find((a) => a.test.test(label));
      if (action) {
        for (const { side, pid, viaFoul } of this.sideOccurrences(
          $,
          homeCell,
          awayCell,
        )) {
          actions.push({
            actionType: action.actionType,
            side,
            pid,
            ...(viaFoul ? { viaFoul: true } : {}),
          });
        }
        return;
      }

      if (SENT_OFF.test(label)) {
        for (const { side, pid } of this.sideOccurrences(
          $,
          homeCell,
          awayCell,
        )) {
          consequences.push({ consequenceType: 'sent_off', side, pid });
        }
        return;
      }

      const consequence = CONSEQUENCE_LABELS.find((c) => c.test.test(label));
      if (consequence) {
        for (const { side, pid } of this.sideOccurrences(
          $,
          homeCell,
          awayCell,
        )) {
          consequences.push({
            consequenceType: consequence.consequenceType,
            side,
            pid,
          });
        }
      }
    });

    return {
      bblId,
      homeTeamId: teams.homeTeamId,
      awayTeamId: teams.awayTeamId,
      actions,
      consequences,
      journeymenCount: {
        home: Math.max(journeymenFloor.home ? 1 : 0, journeymenRemoval.home),
        away: Math.max(journeymenFloor.away ? 1 : 0, journeymenRemoval.away),
      },
    };
  }

  /**
   * Every (side, pid, viaFoul) occurrence across the two side cells of a row,
   * in home-then-away order. The three event kinds a row can carry all walk
   * the cells the same way and differ only in what they push.
   */
  private sideOccurrences(
    $: ReturnType<BblPage['load']>,
    homeCell: ReturnType<ReturnType<BblPage['load']>>,
    awayCell: ReturnType<ReturnType<BblPage['load']>>,
  ): (CellOccurrence & { side: BblEventSide })[] {
    const result: (CellOccurrence & { side: BblEventSide })[] = [];
    for (const side of ['home', 'away'] as const) {
      for (const occurrence of this.occurrences(
        $,
        side === 'home' ? homeCell : awayCell,
      )) {
        result.push({ side, ...occurrence });
      }
    }
    return result;
  }

  /**
   * Player occurrences in a side cell, one entry per occurrence, walking the
   * cell's `<br>`-delimited segments so each link can be tagged with its own
   * segment's "foul by" marker. A cell whose only content is a category-label
   * divider or spacer image yields nothing; a cell with descriptive text but
   * no player link anywhere yields a single anonymous occurrence (an
   * unidentifiable victim); a cell with N player links yields N occurrences.
   */
  private occurrences(
    $: ReturnType<BblPage['load']>,
    cell: ReturnType<ReturnType<BblPage['load']>>,
  ): CellOccurrence[] {
    const result: CellOccurrence[] = [];
    for (const segment of (cell.html() ?? '').split(/<br\s*\/?>/i)) {
      const fragment = $(`<div>${segment}</div>`);
      const links = fragment.find('a');
      if (links.length === 0) {
        continue;
      }
      const marker = this.normalizeText.normalize(
        fragment.clone().find('a, img').remove().end().text(),
      );
      const viaFoul = FOUL_MARKER.test(marker);
      links.each((_i, a) => {
        const href = $(a).attr('href') ?? '';
        const m = PID_LINK.exec(href);
        result.push({
          pid: m ? m[1] : null,
          ...(viaFoul ? { viaFoul: true } : {}),
        });
      });
    }
    if (result.length > 0) {
      return result;
    }
    // No links anywhere: a non-empty, non-spacer text node means one
    // anonymous victim. Deliberately evaluated over the WHOLE cell, not
    // per segment, so a multi-segment link-less cell still yields exactly
    // one anonymous occurrence, exactly as before this change.
    const text = this.normalizeText.normalize(
      cell.clone().find('img').remove().end().text(),
    );
    return text.length > 0 ? [{ pid: null }] : [];
  }

  /**
   * Count `<br>`-separated segments of a cell whose only content is the literal
   * text "journeyman" (case-insensitive, spacer images and whitespace removed)
   * and that carry no player link. Each such segment is a distinct anonymous
   * journeyman: a delinked, un-indexed player BBL renders as the bare word.
   */
  private countJourneymenInCell(
    $: ReturnType<BblPage['load']>,
    cell: ReturnType<ReturnType<BblPage['load']>>,
  ): number {
    const segments = (cell.html() ?? '').split(/<br\s*\/?>/i);
    let count = 0;
    for (const segment of segments) {
      const fragment = $(`<div>${segment}</div>`);
      if (fragment.find('a').length > 0) {
        continue;
      }
      const text = this.normalizeText
        .normalize(fragment.find('img').remove().end().text())
        .toLowerCase();
      if (text === 'journeyman') {
        count += 1;
      }
    }
    return count;
  }
}
