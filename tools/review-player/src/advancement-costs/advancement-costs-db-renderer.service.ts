import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledPlayer } from '../shared/review.types';
import type {
  FigurePlacement,
  ModelledAdvancement,
  SpendComparison,
  StoredUnspentCheck,
  UnknownRangeReason,
  UnspentSppModel,
} from './advancement-cost-model.types';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { StoredUnspentSppCheckService } from './stored-unspent-spp-check.service';

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

const ORDER_NOTE =
  'Gained skills and characteristic increases are listed in their stored order, which is unverified unless marked confirmed; an increase without a stored order is marked order unknown. A confirmed entry sits at its confirmed number; the other numbers shown are one possible order.';

const ORDER_RANGE_NOTE =
  ' The modelled range in the next table holds for any order and any kind.';

const READING_NOTE =
  "Holding unspent SPP is normal and the source's own unspent figure is never flagged. The source's own spend (its total minus its unspent SPP) outside the modelled spend range is a real disagreement; one inside it proves nothing. Gaps in the recorded advancement history make the modelled spend too small, which can explain a reported spend above the range.";

/** The note shown when `SourceSpendComparisonService` does not compare. */
const NOT_COMPARED_NOTE =
  'BBL prices every player at BB2020 costs and recalculates older totals at BB2020 rates, so under a fixed-threshold rules set its figures are never compared; the stored unspent SPP, computed from the stored history, is checked instead.';

/**
 * The stored side of the advancement-cost check: each of the player's
 * advancements with the cost the curated `advancement_costs` give it, then
 * the stored total, the modelled spend and unspent range, and the source's
 * own total, unspent SPP and derived spend beside them. Only a reported spend
 * outside the modelled spend range is highlighted, with a label in words;
 * the source's own unspent SPP never is. Last comes the stored unspent SPP, checked
 * against the modelled unspent range and the source's own unspent figure
 * (`StoredUnspentSppCheckService`) and highlighted the same way when it
 * disagrees.
 */
@Injectable()
export class AdvancementCostsDbRendererService {
  constructor(
    private readonly history: PlayerAdvancementHistoryService,
    private readonly range: AdvancementCostRangeService,
    private readonly figures: SourceUnspentSppFigureService,
    private readonly comparison: SourceSpendComparisonService,
    private readonly storedCheck: StoredUnspentSppCheckService,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const history = (await this.history.forPlayers([player.playerId])).get(
      player.playerId,
    );
    if (history === undefined) {
      return this.html.note(
        `No player row with id ${player.playerId} in the database.`,
      );
    }
    const model = this.range.model(history);
    const figure = await this.figures.figureFor(player);
    const compared = this.comparison.compare(model, figure);
    const stored = this.storedCheck.check(
      model,
      history.storedUnspentSpp,
      figure,
    );
    return (
      this.advancements(model) +
      this.html.subheading('Unspent SPP') +
      this.html.table(
        ['Figure', 'Value'],
        [...this.footerRows(model, figure, compared), this.storedRow(stored)],
      ) +
      (model.unknownReason === null
        ? ''
        : this.html.note(UNKNOWN_REASONS[model.unknownReason])) +
      (compared.kind === 'not_compared'
        ? this.html.note(NOT_COMPARED_NOTE)
        : '') +
      this.html.note(READING_NOTE)
    );
  }

  private advancements(model: UnspentSppModel): string {
    if (model.rulesSetName === null) {
      return '';
    }
    const pricing = model.fixedThresholds
      ? 'fixed thresholds'
      : 'priced by kind';
    return (
      this.html.subheading(`Advancements (${model.rulesSetName}, ${pricing})`) +
      this.html.table(
        ['Advancement', 'Stored source', 'Number', 'Modelled cost'],
        model.rows.map((row) => {
          const cells: TableCell[] = [
            row.label,
            row.storedSource ?? 'characteristic increase',
            this.number(row),
            this.cost(row),
          ];
          return row.orderClash === true
            ? this.html.highlight(cells, [2])
            : cells;
        }),
      ) +
      this.html.note(
        model.range === null ? ORDER_NOTE : ORDER_NOTE + ORDER_RANGE_NOTE,
      )
    );
  }

  private number(row: ModelledAdvancement): string {
    const label = this.numberLabel(row);
    return row.orderClash === true ? `${label}, clashes` : label;
  }

  private numberLabel(row: ModelledAdvancement): string {
    if (row.advancementNumber === null) {
      return 'free';
    }
    if (row.increaseOrder !== undefined) {
      const order = row.increaseOrder;
      if (!order.known) {
        return `#${row.advancementNumber} (order unknown)`;
      }
      return order.confirmed
        ? `#${row.advancementNumber} (confirmed)`
        : `#${row.advancementNumber}`;
    }
    if (row.kind === 'granted') {
      return `#${row.advancementNumber} (fixed by league house rule)`;
    }
    return row.orderConfirmed === true
      ? `#${row.advancementNumber} (confirmed)`
      : `#${row.advancementNumber}`;
  }

  private cost(row: ModelledAdvancement): TableCell {
    if (row.kind === 'starting') {
      return '0 (starting skill)';
    }
    if (row.kind === 'free_extra') {
      return '0 (free extra skill)';
    }
    const [first] = row.candidates;
    if (first === undefined) {
      return 'no cost row at this number';
    }
    if (row.kind === 'granted') {
      return `${first.sppCost} (league house rule)`;
    }
    if (row.candidates.length === 1 && first.advancementKind === 'table_roll') {
      return String(first.sppCost);
    }
    return row.candidates.map(
      (candidate) => `${candidate.advancementKind}: ${candidate.sppCost}`,
    );
  }

  private footerRows(
    model: UnspentSppModel,
    figure: SourceUnspentSppFigure | null,
    compared: SpendComparison,
  ): TableRow[] {
    const rows: TableRow[] = [
      [
        'Stored total SPP',
        model.totalSpp === null ? NONE : String(model.totalSpp),
      ],
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
    if (figure === null) {
      rows.push(['Source figures', 'none read']);
      return rows;
    }
    rows.push(
      [figure.totalLabel, this.value(figure.reportedTotal)],
      [figure.unspentLabel, this.value(figure.unspent)],
      this.spendRow(figure, compared),
    );
    return rows;
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
    // Cell 1 holds the source's spend: that is the disagreeing cell.
    return this.html.highlight(
      [
        figure.spendLabel,
        `${compared.reportedSpend} — outside the modelled spend range (${compared.placement} it)`,
      ],
      [1],
    );
  }

  private storedRow(check: StoredUnspentCheck): TableRow {
    const label = 'Stored unspent SPP';
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
    return this.storedCheck.disagrees(check)
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
