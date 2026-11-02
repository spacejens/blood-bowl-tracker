import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type {
  RawIncreaseMatch,
  RawSkillMatch,
  RawVerdict,
} from '../player-advancements/raw-match.types';
import type {
  ModelledAdvancement,
  UnspentSppModel,
} from './advancement-cost-model.types';

const NONE = '—';
const NOT_IN_RAW: RawVerdict = 'not in the raw source';
const RAW_ONLY = 'in the raw source only';
const INCREASE_SOURCE = 'characteristic increase';
const HEADERS = [
  'Order',
  'Advancement',
  'Source',
  'Modelled cost',
  'Raw source',
];
/** Cell indices of the two columns that can disagree. */
const ORDER_CELL = 0;
const RAW_CELL = 4;

/** What the one advancement table is built from. */
export interface AdvancementTableInput {
  model: UnspentSppModel;
  skills: RawSkillMatch;
  increases: RawIncreaseMatch;
}

/**
 * The imported side's one advancement table: every stored starting skill,
 * gained skill and characteristic increase, in the order the cost model
 * numbers them, with the cost `advancement_costs` gives each at its number
 * and whether the raw source has it. Raw skills and markers nothing stored
 * accounts for follow as their own rows.
 *
 * Order is the model's number: a confirmed entry sits at its confirmed
 * number, a house-rule skill at its rule's, an increase with no stored order
 * says so, and every other entry takes the next free number in stored order.
 * A gained skill takes the dice marker when stored as random and the diamond
 * when elite under the rules set; a starting skill is always plain.
 *
 * A clashing confirmed number and a row the raw source disagrees with are
 * highlighted, each disagreeing cell saying so in words.
 */
@Injectable()
export class AdvancementTableService {
  constructor(
    private readonly skillFormat: SkillFormatService,
    private readonly html: HtmlService,
  ) {}

  render(input: AdvancementTableInput): string {
    const { model } = input;
    if (model.rulesSetName === null) {
      return '';
    }
    const pricing = model.fixedThresholds
      ? 'fixed thresholds'
      : 'priced by kind';
    return (
      this.html.subheading(`Advancements (${model.rulesSetName}, ${pricing})`) +
      this.html.table(HEADERS, [
        ...model.rows.map((row) => this.row(row, input)),
        ...input.skills.rawOnly.map((name) =>
          this.html.highlight([NONE, name, NONE, NONE, RAW_ONLY], [RAW_CELL]),
        ),
        ...input.increases.rawOnly.map((marker) =>
          this.html.highlight(
            [
              `#${marker.advancementOrder}`,
              `+${marker.characteristic}`,
              INCREASE_SOURCE,
              NONE,
              RAW_ONLY,
            ],
            [RAW_CELL],
          ),
        ),
      ])
    );
  }

  private row(
    row: ModelledAdvancement,
    input: AdvancementTableInput,
  ): TableRow {
    const verdict = this.verdict(row, input);
    const cells: TableCell[] = [
      this.number(row),
      this.advancement(row),
      row.storedSource ?? INCREASE_SOURCE,
      this.cost(row),
      verdict,
    ];
    const differing = [
      ...(row.orderClash === true ? [ORDER_CELL] : []),
      ...(verdict === NOT_IN_RAW ? [RAW_CELL] : []),
    ];
    return differing.length === 0
      ? cells
      : this.html.highlight(cells, differing);
  }

  /** The row's raw-source verdict; `not read` when the match did not cover it. */
  private verdict(
    row: ModelledAdvancement,
    input: AdvancementTableInput,
  ): RawVerdict {
    if (row.skill !== undefined) {
      return input.skills.verdicts.get(row.skill) ?? 'not read';
    }
    if (row.increase !== undefined) {
      return input.increases.verdicts.get(row.increase) ?? 'not read';
    }
    return 'not read';
  }

  private advancement(row: ModelledAdvancement): string {
    if (row.skill === undefined) {
      return row.label;
    }
    const gained = row.skill.source !== 'starting';
    return this.skillFormat.format({
      name: row.skill.skillName,
      attributeValue: row.skill.attributeValue,
      isRandom: row.skill.source === 'random',
      isElite: gained && row.skill.isElite,
    });
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
}
