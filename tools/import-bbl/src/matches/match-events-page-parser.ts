import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page';
import { MatchTeamsPageParser } from './match-teams-page-parser';

export type BblEventSide = 'home' | 'away';

export interface BblActionOccurrence {
  actionType: ActionType;
  side: BblEventSide;
  pid: string | null;
}

export interface BblConsequenceOccurrence {
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
}

const PID_LINK = /[?&]p=pl&pid=([^&#"']+)/;

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
  private readonly teamsParser = new MatchTeamsPageParser();

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

    $('table.tblist tr').each((_i, tr) => {
      const cells = $(tr).find('td');
      if (cells.length !== 3) {
        return;
      }
      const label = $(cells[1]).text().trim();
      if (!label) {
        return;
      }
      const homeCell = $(cells[0]);
      const awayCell = $(cells[2]);

      const action = ACTION_LABELS.find((a) => a.test.test(label));
      if (action) {
        for (const side of ['home', 'away'] as const) {
          for (const pid of this.occurrences(
            $,
            side === 'home' ? homeCell : awayCell,
          )) {
            actions.push({ actionType: action.actionType, side, pid });
          }
        }
        return;
      }

      if (SENT_OFF.test(label)) {
        for (const side of ['home', 'away'] as const) {
          for (const pid of this.occurrences(
            $,
            side === 'home' ? homeCell : awayCell,
          )) {
            consequences.push({ consequenceType: 'sent_off', side, pid });
          }
        }
        return;
      }

      const consequence = CONSEQUENCE_LABELS.find((c) => c.test.test(label));
      if (consequence) {
        for (const side of ['home', 'away'] as const) {
          for (const pid of this.occurrences(
            $,
            side === 'home' ? homeCell : awayCell,
          )) {
            consequences.push({
              consequenceType: consequence.consequenceType,
              side,
              pid,
            });
          }
        }
      }
    });

    return {
      bblId,
      homeTeamId: teams.homeTeamId,
      awayTeamId: teams.awayTeamId,
      actions,
      consequences,
    };
  }

  /**
   * Player pids in a side cell, one entry per occurrence. A cell whose only
   * content is a category-label divider or spacer image yields nothing; a
   * cell with descriptive text but no player link yields a single `null` (an
   * unidentifiable victim). A cell with N player links yields N pids.
   */
  private occurrences(
    $: ReturnType<BblPage['load']>,
    cell: ReturnType<ReturnType<BblPage['load']>>,
  ): (string | null)[] {
    const links = cell.find('a');
    const pids: (string | null)[] = [];
    links.each((_i, a) => {
      const href = $(a).attr('href') ?? '';
      const m = PID_LINK.exec(href);
      pids.push(m ? m[1] : null);
    });
    if (pids.length > 0) {
      return pids;
    }
    // No links: a non-empty, non-spacer text node means one anonymous victim.
    const text = cell
      .clone()
      .find('img')
      .remove()
      .end()
      .text()
      .replace(/\u00A0/g, ' ')
      .trim();
    return text.length > 0 ? [null] : [];
  }
}
