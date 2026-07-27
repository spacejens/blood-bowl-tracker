import type {
  ActionType,
  ConsequenceAvoidedBy,
  ConsequenceType,
  UnidentifiedParticipantKind,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { BblPage } from '../source/bbl-page.types';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import type { CellAnnotation } from './cell-annotation.service';
import { CellAnnotationService } from './cell-annotation.service';
import { MatchTeamsPageParser } from './match-teams-page-parser';

export type BblEventSide = 'home' | 'away';

/** Whether a row's label made it an achievement (action) or an injury row. */
type BblRowKind = 'action' | 'consequence';

/**
 * A `<br>` segment of an event cell that carried text the importer could not
 * turn into an occurrence: either outside the known vocabulary, or a known
 * annotation used in a row kind where it cannot apply. Non-fatal by design —
 * an unexpected annotation must never abort a page — and surfaced by
 * `BblMatchEventsImportService` alongside its other import errors.
 */
export interface BblCellAnnotationError {
  label: string;
  side: BblEventSide;
  text: string;
  reason: 'unrecognised' | 'misplaced';
}

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
  /** Set when BBL named the actor as plain text instead of a player link. */
  unidentifiedKind?: UnidentifiedParticipantKind;
}

interface BblConsequenceOccurrence {
  consequenceType: ConsequenceType;
  side: BblEventSide;
  pid: string | null;
  /** Set when BBL named the recipient as plain text instead of a link. */
  unidentifiedKind?: UnidentifiedParticipantKind;
  /**
   * Set when the row's cell said the casualty was prevented. `consequenceType`
   * still holds the severity BBL listed; the substitution to
   * `casualty_avoided` happens in MatchEventCorrelationService at emit time.
   */
  avoidedBy?: ConsequenceAvoidedBy;
}

export interface BblMatchEvents {
  bblId: string;
  homeTeamId: string;
  awayTeamId: string;
  actions: BblActionOccurrence[];
  consequences: BblConsequenceOccurrence[];
  journeymenCount?: { home: number; away: number };
  /** Empty on a clean page; never a reason to reject the page. */
  annotationErrors?: BblCellAnnotationError[];
}

const PID_LINK = /[?&]p=pl&pid=([^&#"']+)/;

/**
 * The literal text BBL puts before a causer's player link when the casualty
 * came from a foul, e.g. `foul by <a href="...">Eeeh-Gor</a>` (confirmed on
 * real mirrored pages, e.g. match 1830's "Badly Hurt'ers" cell). Matched
 * against the segment's text with player links and spacer images stripped and
 * whitespace normalized. Distinct from `cell-annotation.service.ts`'s bare-foul
 * marker (no link), which that file names `BARE_FOUL` — same idea, different
 * segment shape, kept as two separately-named constants so an edit to one is
 * never mistaken for an edit to the other.
 */
const FOUL_BY_PREFIX = /^foul by$/i;

/** A casualty action row's severity: the only rows a bare `foul` marker may appear in. */
const CASUALTY_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
  'badly_hurt',
  'serious_injury',
  'death',
]);

/**
 * An injury consequence row's severity: the only rows an avoided-consequence
 * annotation (`victim healed by apoth`, `victim regenerated`) may appear in.
 * Notably excludes `sent_off`, which is a removal consequence but not an
 * injury one — "avoided" would be nonsensical there (sent off is never
 * "prevented" by an apothecary or regeneration).
 */
const INJURY_CONSEQUENCE_TYPES: ReadonlySet<ConsequenceType> = new Set([
  'badly_hurt',
  'serious_injury',
  'death',
  'miss_next_game',
  'niggling_injury',
  'stat_reduction_ma',
  'stat_reduction_st',
  'stat_reduction_ag',
  'stat_reduction_av',
  'stat_reduction_pa',
]);

/** One player occurrence read out of a single side cell. */
interface CellOccurrence {
  pid: string | null;
  viaFoul?: boolean;
  unidentifiedKind?: UnidentifiedParticipantKind;
  avoidedBy?: ConsequenceAvoidedBy;
}

type PageApi = ReturnType<BblPage['load']>;
type CellSelection = ReturnType<PageApi>;

interface RowWalkOptions {
  $: PageApi;
  homeCell: CellSelection;
  awayCell: CellSelection;
  rowKind: BblRowKind;
  label: string;
  errors: BblCellAnnotationError[];
  /** The row's resolved action type, when `rowKind` is `'action'`. */
  actionType?: ActionType;
  /** The row's resolved consequence type, when `rowKind` is `'consequence'`. */
  consequenceType?: ConsequenceType;
}

interface CellWalkOptions {
  $: PageApi;
  cell: CellSelection;
  side: BblEventSide;
  rowKind: BblRowKind;
  label: string;
  errors: BblCellAnnotationError[];
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
}

interface SegmentOptions {
  text: string;
  side: BblEventSide;
  rowKind: BblRowKind;
  label: string;
  errors: BblCellAnnotationError[];
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
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

  constructor(
    private readonly normalizeText: NormalizeExtractedTextService,
    private readonly cellAnnotation: CellAnnotationService,
  ) {
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
    const annotationErrors: BblCellAnnotationError[] = [];
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
        for (const occurrence of this.sideOccurrences({
          $,
          homeCell,
          awayCell,
          rowKind: 'action',
          label,
          errors: annotationErrors,
          actionType: action.actionType,
        })) {
          actions.push({
            actionType: action.actionType,
            side: occurrence.side,
            pid: occurrence.pid,
            ...(occurrence.viaFoul ? { viaFoul: true } : {}),
            ...(occurrence.unidentifiedKind
              ? { unidentifiedKind: occurrence.unidentifiedKind }
              : {}),
          });
        }
        return;
      }

      if (SENT_OFF.test(label)) {
        for (const occurrence of this.sideOccurrences({
          $,
          homeCell,
          awayCell,
          rowKind: 'consequence',
          label,
          errors: annotationErrors,
          consequenceType: 'sent_off',
        })) {
          consequences.push(this.consequenceOccurrence('sent_off', occurrence));
        }
        return;
      }

      const consequence = CONSEQUENCE_LABELS.find((c) => c.test.test(label));
      if (consequence) {
        for (const occurrence of this.sideOccurrences({
          $,
          homeCell,
          awayCell,
          rowKind: 'consequence',
          label,
          errors: annotationErrors,
          consequenceType: consequence.consequenceType,
        })) {
          consequences.push(
            this.consequenceOccurrence(consequence.consequenceType, occurrence),
          );
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
      annotationErrors,
    };
  }

  /** One consequence occurrence, carrying whichever cell tags were set. */
  private consequenceOccurrence(
    consequenceType: ConsequenceType,
    occurrence: CellOccurrence & { side: BblEventSide },
  ): BblConsequenceOccurrence {
    return {
      consequenceType,
      side: occurrence.side,
      pid: occurrence.pid,
      ...(occurrence.unidentifiedKind
        ? { unidentifiedKind: occurrence.unidentifiedKind }
        : {}),
      ...(occurrence.avoidedBy ? { avoidedBy: occurrence.avoidedBy } : {}),
    };
  }

  /**
   * Every occurrence across the two side cells of a row, in home-then-away
   * order. The three event kinds a row can carry all walk the cells the same
   * way and differ only in what they push.
   */
  private sideOccurrences(
    options: RowWalkOptions,
  ): (CellOccurrence & { side: BblEventSide })[] {
    const {
      $,
      homeCell,
      awayCell,
      rowKind,
      label,
      errors,
      actionType,
      consequenceType,
    } = options;
    const result: (CellOccurrence & { side: BblEventSide })[] = [];
    for (const side of ['home', 'away'] as const) {
      for (const occurrence of this.occurrences({
        $,
        cell: side === 'home' ? homeCell : awayCell,
        side,
        rowKind,
        label,
        errors,
        actionType,
        consequenceType,
      })) {
        result.push({ side, ...occurrence });
      }
    }
    return result;
  }

  /**
   * Occurrences in a side cell, one entry per `<br>`-delimited segment (or per
   * player link, for a segment carrying several). A segment with links yields
   * one occurrence per link, tagged with that segment's "foul by" marker; a
   * link-less segment is classified against BBL's annotation vocabulary, which
   * is what makes an unlinked entry survive alongside a linked one and makes
   * several unlinked entries stay several occurrences. A segment whose text is
   * empty after stripping spacer images yields nothing.
   */
  private occurrences(options: CellWalkOptions): CellOccurrence[] {
    const {
      $,
      cell,
      side,
      rowKind,
      label,
      errors,
      actionType,
      consequenceType,
    } = options;
    const result: CellOccurrence[] = [];
    for (const segment of (cell.html() ?? '').split(/<br\s*\/?>/i)) {
      const fragment = $(`<div>${segment}</div>`);
      const links = fragment.find('a');
      const text = this.normalizeText.normalize(
        fragment.clone().find('a, img').remove().end().text(),
      );
      if (links.length === 0) {
        const occurrence = this.classifySegment({
          text,
          side,
          rowKind,
          label,
          errors,
          actionType,
          consequenceType,
        });
        if (occurrence) {
          result.push(occurrence);
        }
        continue;
      }
      const viaFoul = FOUL_BY_PREFIX.test(text);
      if (text.length > 0 && !viaFoul) {
        errors.push({ label, side, text, reason: 'unrecognised' });
      }
      links.each((_i, a) => {
        const href = $(a).attr('href') ?? '';
        const m = PID_LINK.exec(href);
        result.push({
          pid: m ? m[1] : null,
          ...(viaFoul ? { viaFoul: true } : {}),
        });
      });
    }
    return result;
  }

  /**
   * Turn one link-less segment's text into an occurrence, or into a non-fatal
   * error. Placement is validated against the row's actual resolved type, not
   * just its coarse action/consequence kind: an avoided-consequence
   * annotation only makes sense in an injury-severity consequence row (never
   * e.g. `sent_off`, which is a removal but not an injury), and a bare foul
   * marker only makes sense in a casualty-severity action row (never e.g.
   * `TD Scorers`, where it would otherwise silently turn a touchdown into a
   * foul downstream). The wrong pairing is reported rather than silently
   * mis-filed.
   */
  private classifySegment(options: SegmentOptions): CellOccurrence | null {
    const { text, side, rowKind, label, errors, actionType, consequenceType } =
      options;
    if (text.length === 0) {
      return null;
    }
    const annotation: CellAnnotation = this.cellAnnotation.classify(text);
    switch (annotation.kind) {
      case 'unidentified':
        return { pid: null, unidentifiedKind: annotation.participant };
      case 'avoided':
        if (
          rowKind !== 'consequence' ||
          !consequenceType ||
          !INJURY_CONSEQUENCE_TYPES.has(consequenceType)
        ) {
          errors.push({ label, side, text, reason: 'misplaced' });
          return null;
        }
        return { pid: null, avoidedBy: annotation.avoidedBy };
      case 'foul':
        if (
          rowKind !== 'action' ||
          !actionType ||
          !CASUALTY_ACTION_TYPES.has(actionType)
        ) {
          errors.push({ label, side, text, reason: 'misplaced' });
          return null;
        }
        return { pid: null, viaFoul: true };
      case 'ignored':
        return null;
      default:
        errors.push({ label, side, text, reason: 'unrecognised' });
        return null;
    }
  }

  /**
   * Count `<br>`-separated segments of a cell whose only content is the literal
   * text "journeyman" (case-insensitive, spacer images and whitespace removed)
   * and that carry no player link. Each such segment is a distinct anonymous
   * journeyman: a delinked, un-indexed player BBL renders as the bare word.
   */
  private countJourneymenInCell($: PageApi, cell: CellSelection): number {
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
