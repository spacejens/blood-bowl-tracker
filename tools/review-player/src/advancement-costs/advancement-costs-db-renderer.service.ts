import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledPlayer } from '../shared/review.types';
import type {
  ModelledAdvancement,
  UnknownRangeReason,
  UnspentSppModel,
} from './advancement-cost-model.types';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';

const NONE = '—';

const UNKNOWN_REASONS: Readonly<Record<UnknownRangeReason, string>> = {
  star_player: 'Star players never advance, so no range is modelled.',
  no_total_spp: 'The player has no stored total SPP, so no range is modelled.',
  no_rules_set: 'The era maps to no rules set, so no cost applies.',
  no_costs: 'The rules set has no advancement costs, so no range is modelled.',
  unpriced_advancement:
    'At least one advancement number has no cost row, so no range is modelled.',
};

const ORDER_NOTE =
  'Gained skills are listed in their stored order, which is unverified; characteristic increases are counts, so their order is unknown. The numbers shown are one possible order: the range below holds for any order and any kind.';

const READING_NOTE =
  'Holding unspent SPP is normal and is never flagged. A source figure outside the modelled unspent range is a real disagreement; one inside it proves nothing. Gaps in the recorded advancement history make the modelled spend too small, which can explain a source figure below the range.';

/**
 * The stored side of the advancement-cost check: each of the player's
 * advancements with the cost the curated `advancement_costs` give it, then
 * the stored total, the modelled spend and unspent range, and the source's
 * own figures beside them. Only a source figure outside the modelled range
 * is highlighted, with a label in words; unspent SPP itself never is.
 */
@Injectable()
export class AdvancementCostsDbRendererService {
  constructor(
    private readonly history: PlayerAdvancementHistoryService,
    private readonly range: AdvancementCostRangeService,
    private readonly figures: SourceUnspentSppFigureService,
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
    return (
      this.advancements(model) +
      this.html.subheading('Unspent SPP') +
      this.html.table(['Figure', 'Value'], this.footerRows(model, figure)) +
      (model.unknownReason === null
        ? ''
        : this.html.note(UNKNOWN_REASONS[model.unknownReason])) +
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
        model.rows.map((row) => [
          row.label,
          row.storedSource ?? 'characteristic increase',
          this.number(row),
          this.cost(row),
        ]),
      ) +
      this.html.note(ORDER_NOTE)
    );
  }

  private number(row: ModelledAdvancement): string {
    if (row.advancementNumber === null) {
      return 'free';
    }
    if (row.kind === 'characteristic') {
      return `#${row.advancementNumber} (order unknown)`;
    }
    if (row.kind === 'granted') {
      return `#${row.advancementNumber} (fixed by league house rule)`;
    }
    return `#${row.advancementNumber}`;
  }

  private cost(row: ModelledAdvancement): TableCell {
    if (row.kind === 'starting') {
      return '0 (starting skill)';
    }
    if (row.kind === 'trophy') {
      return '0 (trophy mutation)';
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
    rows.push(this.unspentRow(model, figure));
    rows.push([
      figure.totalLabel,
      figure.reportedTotal === null ? NONE : String(figure.reportedTotal),
    ]);
    return rows;
  }

  private unspentRow(
    model: UnspentSppModel,
    figure: SourceUnspentSppFigure,
  ): TableRow {
    if (figure.unspent === null) {
      return [figure.unspentLabel, NONE];
    }
    if (model.range === null) {
      return [figure.unspentLabel, String(figure.unspent)];
    }
    const placement = this.range.placement(figure.unspent, model.range);
    if (placement === 'inside') {
      return [
        figure.unspentLabel,
        `${figure.unspent} (inside the modelled range)`,
      ];
    }
    // Cell 1 holds the source's figure: that is the disagreeing cell.
    return this.html.highlight(
      [
        figure.unspentLabel,
        `${figure.unspent} — outside the modelled range (${placement} it)`,
      ],
      [1],
    );
  }

  private span(min: number, max: number): string {
    return min === max ? String(min) : `${min} to ${max}`;
  }
}
