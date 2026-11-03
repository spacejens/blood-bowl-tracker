import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type {
  FigurePlacement,
  SpendComparison,
  StoredUnspentCheck,
  UnknownRangeReason,
  UnspentSppModel,
} from './advancement-cost-model.types';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';

const NONE = '—';

const UNKNOWN_REASONS: Readonly<Record<UnknownRangeReason, string>> = {
  star_player: 'Star players never advance, so no range is modelled.',
  no_total_spp: 'The player has no stored total SPP, so no range is modelled.',
  no_rules_set: 'The era maps to no rules set, so no cost applies.',
  no_costs: 'The rules set has no advancement costs, so no range is modelled.',
  unpriced_advancement:
    'At least one advancement number has no cost row, so no range is modelled.',
  order_clash:
    "Confirmed advancement numbers clash: two entries are confirmed at the same number, one is confirmed past the number of paid advancements, or a league house-rule skill is confirmed at a number other than its rule's. No order of the advancements fits, so no range is modelled.",
};

/** Appended to a reported spend that lies above the modelled range only. */
const ABOVE_RANGE_GAP =
  'a gap in the recorded advancement history can explain a spend above the range';

/** What the unspent-SPP table is built from. */
export interface UnspentSppTableInput {
  model: UnspentSppModel;
  figure: SourceUnspentSppFigure | null;
  compared: SpendComparison;
  stored: StoredUnspentCheck;
  /** Whether the stored figure disagrees with the range or the source. */
  storedDisagrees: boolean;
}

/**
 * The unspent-SPP part of the career history: the modelled spend and unspent
 * ranges, the source's own total, unspent figure and the spend derived from
 * them, and the stored unspent SPP. Only a reported spend outside the
 * modelled spend range is highlighted, labelled in words (and, above the
 * range only, with the history-gap explanation); the source's own unspent
 * figure never is. The stored figure is highlighted when it lies outside the
 * modelled unspent range or differs from the source. When no range could be
 * modelled, one plain-text line says why. The stored total is not repeated
 * here: the career history's SPP total shows it.
 */
@Injectable()
export class UnspentSppTableService {
  constructor(private readonly html: HtmlService) {}

  render(input: UnspentSppTableInput): string {
    const reason = input.model.unknownReason;
    return (
      this.html.subheading('Unspent SPP') +
      this.html.table(
        ['Figure', 'Value'],
        [
          ...this.rangeRows(input.model),
          ...this.sourceRows(input),
          this.storedRow(input),
        ],
      ) +
      (reason === null
        ? ''
        : `<p>${this.html.escape(UNKNOWN_REASONS[reason])}</p>`)
    );
  }

  private rangeRows(model: UnspentSppModel): TableRow[] {
    return [
      [
        'Modelled spend',
        model.range === null
          ? NONE
          : this.span(model.range.spentMin, model.range.spentMax),
      ],
      [
        'Modelled unspent',
        model.range === null
          ? NONE
          : this.span(model.range.unspentMin, model.range.unspentMax),
      ],
    ];
  }

  private sourceRows(input: UnspentSppTableInput): TableRow[] {
    const { figure } = input;
    if (figure === null) {
      return [['Source figures', 'none read']];
    }
    return [
      [figure.totalLabel, this.value(figure.reportedTotal)],
      [figure.unspentLabel, this.value(figure.unspent)],
      this.spendRow(figure, input.compared),
    ];
  }

  private spendRow(
    figure: SourceUnspentSppFigure,
    compared: SpendComparison,
  ): TableRow {
    if (compared.kind === 'none') {
      const spend =
        figure.reportedTotal === null || figure.unspent === null
          ? null
          : figure.reportedTotal - figure.unspent;
      return [figure.spendLabel, this.value(spend)];
    }
    if (compared.kind === 'not_compared') {
      return [
        figure.spendLabel,
        `${compared.reportedSpend} (not compared under this rules set)`,
      ];
    }
    if (compared.placement === 'inside') {
      return [
        figure.spendLabel,
        `${compared.reportedSpend} (inside the modelled spend range)`,
      ];
    }
    const why =
      compared.placement === 'above'
        ? `above it; ${ABOVE_RANGE_GAP}`
        : 'below it';
    // Cell 1 holds the source's spend: that is the disagreeing cell.
    return this.html.highlight(
      [
        figure.spendLabel,
        `${compared.reportedSpend} — outside the modelled spend range (${why})`,
      ],
      [1],
    );
  }

  private storedRow(input: UnspentSppTableInput): TableRow {
    const label = 'Stored unspent SPP';
    const check = input.stored;
    if (check.kind === 'none_stored') {
      return [label, `${NONE} (not known exactly)`];
    }
    const notes = [
      this.storedPlacementNote(check.placement),
      this.storedSourceNote(check),
    ].filter((note): note is string => note !== null);
    const text =
      notes.length === 0
        ? String(check.stored)
        : `${check.stored} (${notes.join('; ')})`;
    // Cell 1 holds the stored figure: that is the disagreeing cell.
    return input.storedDisagrees
      ? this.html.highlight([label, text], [1])
      : [label, text];
  }

  private storedPlacementNote(
    placement: FigurePlacement | null,
  ): string | null {
    if (placement === null) {
      return null;
    }
    return placement === 'inside'
      ? 'inside the modelled unspent range'
      : `${placement} the modelled unspent range, which may mean a gap in the recorded history, a free skill, or an unrecorded order or chosen-or-random choice`;
  }

  private storedSourceNote(
    check: Extract<StoredUnspentCheck, { kind: 'stored' }>,
  ): string | null {
    switch (check.source) {
      case 'matches':
        return 'matches the source figure';
      case 'differs':
        return `differs from the source figure, ${check.sourceUnspent}`;
      case 'not_compared':
        return 'not compared with the source figure under this rules set';
      case 'no_figure':
        return null;
    }
  }

  private value(figure: number | null): string {
    return figure === null ? NONE : String(figure);
  }

  private span(min: number, max: number): string {
    return min === max ? String(min) : `${min} to ${max}`;
  }
}
