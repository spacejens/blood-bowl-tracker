import type { FillIncompletePlayer } from '@blood-bowl-tracker/api-contract';
import type { PlayerSkillSource } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  PlannedFillRow,
  StoredFillFields,
  StoredFillRow,
} from './player-fill.types';

export interface FillComparisonInput {
  fields: StoredFillFields;
  rows: StoredFillRow[];
  data: FillIncompletePlayer;
  planned: PlannedFillRow[];
}

export interface FillComparison {
  /** Each stored value the entry contradicts, phrased to stand alone. */
  contradictions: string[];
  /** Whether the player is stored exactly as the fill would leave him. */
  identical: boolean;
}

/** One stored field against the entry's value; a null stored value is unset. */
interface FieldCheck {
  label: string;
  stored: number | string | null;
  entry: number | string | null;
}

/**
 * Compares a fill with the player as stored. A fill never overwrites source
 * data: a stored non-default value (a non-zero MA, ST, AG or AV; a non-null
 * PA, total SPP, unspent SPP or status) must equal the entry's, and every
 * stored advancement row must be one of the entry's. A stored row matches a
 * planned one of the same kind: a starting skill only a starting skill, a
 * gained skill a gained skill of the same skill and variant, an increase an
 * increase of the same characteristic (preferring the one with its confirmed
 * number). Once matched, its chosen/random source, confirmed number and
 * free-extra flag must not be contradicted. `identical` says a re-sent fill
 * would change nothing.
 *
 * The stored SPP adjustment is not compared: the fill computes it, and only
 * when none is stored.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class PlayerFillComparisonService {
  compare(input: FillComparisonInput): FillComparison {
    const contradictions = this.fieldChecks(input.fields, input.data, true)
      .filter((check) => check.stored !== null && check.stored !== check.entry)
      .map(
        (check) =>
          `stored ${check.label} ${String(check.stored)}, the entry says ${String(check.entry)}`,
      );
    const unmatched = input.planned.map((_row, at) => at);
    const matches = this.matchRows(input.rows, input.planned, unmatched);
    let rowsExact = true;
    input.rows.forEach((row, index) => {
      const at = matches[index];
      if (at === undefined) {
        contradictions.push(
          `${this.describe(row)} is stored but not in the entry`,
        );
        return;
      }
      const planned = input.planned[at];
      const problem = this.rowProblem(row, planned);
      if (problem !== undefined) {
        contradictions.push(problem);
      }
      rowsExact &&= this.rowExact(row, planned);
    });
    const fieldsEqual = this.fieldChecks(input.fields, input.data, false).every(
      (check) => check.stored === check.entry,
    );
    return {
      contradictions,
      identical:
        contradictions.length === 0 &&
        unmatched.length === 0 &&
        rowsExact &&
        fieldsEqual,
    };
  }

  /**
   * The written fields against the entry. With `zeroAsUnset` a zero MA, ST,
   * AG or AV reads as null, since zero is their column default.
   */
  private fieldChecks(
    fields: StoredFillFields,
    data: FillIncompletePlayer,
    zeroAsUnset: boolean,
  ): FieldCheck[] {
    const characteristic = (value: number): number | null =>
      zeroAsUnset && value === 0 ? null : value;
    const line = data.characteristics;
    return [
      { label: 'MA', stored: characteristic(fields.move), entry: line.move },
      {
        label: 'ST',
        stored: characteristic(fields.strength),
        entry: line.strength,
      },
      {
        label: 'AG',
        stored: characteristic(fields.agility),
        entry: line.agility,
      },
      { label: 'PA', stored: fields.passing, entry: line.passing },
      {
        label: 'AV',
        stored: characteristic(fields.armour),
        entry: line.armour,
      },
      { label: 'total SPP', stored: fields.sppTotal, entry: data.sppTotal },
      {
        label: 'unspent SPP',
        stored: fields.unspentSpp,
        entry: data.unspentSpp,
      },
      { label: 'status', stored: fields.status, entry: data.status },
    ];
  }

  /**
   * Pairs each stored row with a planned one (by stored-row index), taking
   * confirmed rows first so an unconfirmed row never uses up the planned row
   * whose paid number a confirmed row needs. Removes the paired rows from
   * `unmatched`.
   */
  private matchRows(
    rows: StoredFillRow[],
    planned: PlannedFillRow[],
    unmatched: number[],
  ): (number | undefined)[] {
    const matches: (number | undefined)[] = rows.map(() => undefined);
    const byConfirmed = rows
      .map((_row, index) => index)
      .sort(
        (a, b) =>
          Number(rows[b].orderConfirmed) - Number(rows[a].orderConfirmed),
      );
    for (const index of byConfirmed) {
      const at = this.matchIndex(rows[index], planned, unmatched);
      if (at !== undefined) {
        unmatched.splice(unmatched.indexOf(at), 1);
        matches[index] = at;
      }
    }
    return matches;
  }

  /** The unmatched planned row this stored row pairs with, if any. */
  private matchIndex(
    row: StoredFillRow,
    planned: PlannedFillRow[],
    unmatched: number[],
  ): number | undefined {
    const candidates = unmatched.filter((at) =>
      this.sameAdvancement(row, planned[at]),
    );
    if (row.orderConfirmed) {
      const numbered = candidates.find(
        (at) => planned[at].paidNumber === row.advancementOrder,
      );
      if (numbered !== undefined) {
        return numbered;
      }
    }
    return candidates[0];
  }

  private sameAdvancement(
    row: StoredFillRow,
    planned: PlannedFillRow,
  ): boolean {
    if (
      row.source === 'characteristic' ||
      planned.source === 'characteristic'
    ) {
      return (
        row.source === planned.source &&
        row.characteristic === planned.characteristic
      );
    }
    if ((row.source === 'starting') !== (planned.source === 'starting')) {
      return false;
    }
    return (
      row.skillId === planned.skillId &&
      row.attributeValue === planned.attributeValue
    );
  }

  private rowProblem(
    row: StoredFillRow,
    planned: PlannedFillRow,
  ): string | undefined {
    if (
      this.isChosenOrRandom(row.source) &&
      this.isChosenOrRandom(planned.source) &&
      row.source !== planned.source
    ) {
      return `${this.describe(row)} is stored as ${row.source}, the entry says ${planned.source}`;
    }
    if (row.orderConfirmed && row.advancementOrder !== planned.paidNumber) {
      const entryNumber =
        planned.paidNumber === null
          ? 'a free extra'
          : `advancement ${planned.paidNumber}`;
      return `${this.describe(row)} is stored confirmed as advancement ${String(row.advancementOrder)}, the entry makes it ${entryNumber}`;
    }
    if (row.isFreeExtra && !planned.isFreeExtra) {
      return `${this.describe(row)} is stored as a free extra, the entry lists it as a paid advancement`;
    }
    return undefined;
  }

  /** Whether the stored row already is what the sync would leave. */
  private rowExact(row: StoredFillRow, planned: PlannedFillRow): boolean {
    // The sync never replaces a stored chosen or random source with
    // `advancement`, so that pair already agrees.
    const sourceAgrees =
      row.source === planned.source ||
      (planned.source === 'advancement' && this.isChosenOrRandom(row.source));
    const orderAgrees =
      planned.paidNumber === null ||
      (row.orderConfirmed && row.advancementOrder === planned.paidNumber);
    return (
      sourceAgrees && row.isFreeExtra === planned.isFreeExtra && orderAgrees
    );
  }

  private isChosenOrRandom(source: PlayerSkillSource): boolean {
    return source === 'chosen' || source === 'random';
  }

  private describe(row: StoredFillRow): string {
    if (row.source === 'characteristic') {
      return `a ${String(row.characteristic)} increase`;
    }
    const variant =
      row.attributeValue === null ? '' : ` (${row.attributeValue})`;
    const kind = row.source === 'starting' ? 'starting skill' : 'skill';
    return `${kind} ${String(row.skillId)}${variant}`;
  }
}
