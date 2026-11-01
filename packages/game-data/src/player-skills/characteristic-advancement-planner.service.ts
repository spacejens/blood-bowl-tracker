import type { PlayerCharacteristic } from '@blood-bowl-tracker/domain-enums';
import { PLAYER_CHARACTERISTICS } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

export interface StoredCharacteristicRow {
  id: number;
  characteristic: PlayerCharacteristic;
  advancementOrder: number | null;
  orderConfirmed: boolean;
  removed: boolean;
}
export interface IncomingCharacteristicEntry {
  /** The entry's index in the sync batch. */
  index: number;
  characteristic: PlayerCharacteristic;
  /** Undefined: append after the player's highest order. Null: unknown. */
  advancementOrder: number | null | undefined;
  orderConfirmed: boolean;
}
export interface CharacteristicPlanInput {
  stored: StoredCharacteristicRow[];
  incoming: IncomingCharacteristicEntry[];
  /** The player's highest advancement order before anything is appended; 0 when none. */
  highestOrder: number;
}
export interface CharacteristicRowValues {
  advancementOrder?: number | null;
  orderConfirmed?: boolean;
  removed?: boolean;
}
export interface CharacteristicRowInsert {
  index: number;
  characteristic: PlayerCharacteristic;
  advancementOrder: number | null;
  orderConfirmed: boolean;
}
export interface CharacteristicPlan {
  updates: { id: number; values: CharacteristicRowValues }[];
  inserts: CharacteristicRowInsert[];
  /** Batch index -> the stored row (kept or revived) that now stands for it. */
  existingIdsByIndex: Map<number, number>;
}

/** Anything ranked: a stored row or an incoming entry. */
interface Ranked {
  advancementOrder: number | null | undefined;
  orderConfirmed: boolean;
}

/** The counter appended orders are drawn from, shared across characteristics. */
interface Appender {
  highest: number;
}

/**
 * Decides how one player's stored characteristic-increase rows change to
 * match the increases a source now reports, one characteristic at a time.
 *
 * Rows and entries are paired best first: confirmed ones, then ones with an
 * order, then unordered ones. A paired row keeps its id. An unconfirmed entry
 * never changes a confirmed row; otherwise the entry's order replaces the
 * stored one (an entry without an order leaves it alone) and a confirmed entry
 * confirms the row. Stored rows left over, the worst-ranked ones, are flagged
 * `removed`, because tracked rows cannot be deleted; their order is cleared.
 * Entries left over revive a removed row of that characteristic before a new
 * row is inserted. An entry with no order is appended after the player's
 * highest order, characteristics in stat-line order.
 *
 * Pure decision logic, with no I/O, no dependencies and no external state.
 */
@Injectable()
export class CharacteristicAdvancementPlannerService {
  plan(input: CharacteristicPlanInput): CharacteristicPlan {
    const plan: CharacteristicPlan = {
      updates: [],
      inserts: [],
      existingIdsByIndex: new Map(),
    };
    const appender: Appender = { highest: input.highestOrder };
    for (const characteristic of PLAYER_CHARACTERISTICS) {
      this.planCharacteristic({ characteristic, input, plan, appender });
    }
    return plan;
  }

  private planCharacteristic(options: {
    characteristic: PlayerCharacteristic;
    input: CharacteristicPlanInput;
    plan: CharacteristicPlan;
    appender: Appender;
  }): void {
    const { characteristic, input, plan, appender } = options;
    const ofThis = input.stored.filter(
      (row) => row.characteristic === characteristic,
    );
    const active = ofThis
      .filter((row) => !row.removed)
      .sort((a, b) => this.compare(a, b) || a.id - b.id);
    const revivable = ofThis
      .filter((row) => row.removed)
      .sort((a, b) => a.id - b.id);
    const entries = input.incoming
      .filter((entry) => entry.characteristic === characteristic)
      .sort((a, b) => this.compare(a, b) || a.index - b.index);

    entries.forEach((entry, at) => {
      const kept = active[at];
      if (kept !== undefined) {
        plan.existingIdsByIndex.set(entry.index, kept.id);
        this.push(plan, kept.id, this.keptValues(kept, entry));
        return;
      }
      const order = this.orderFor(entry, appender);
      const revived = revivable.shift();
      if (revived !== undefined) {
        plan.existingIdsByIndex.set(entry.index, revived.id);
        plan.updates.push({
          id: revived.id,
          values: {
            removed: false,
            ...(order === null ? {} : { advancementOrder: order }),
            ...(entry.orderConfirmed ? { orderConfirmed: true } : {}),
          },
        });
        return;
      }
      plan.inserts.push({
        index: entry.index,
        characteristic,
        advancementOrder: order,
        orderConfirmed: entry.orderConfirmed,
      });
    });

    for (const surplus of active.slice(entries.length)) {
      plan.updates.push({
        id: surplus.id,
        values: {
          removed: true,
          ...(surplus.advancementOrder === null
            ? {}
            : { advancementOrder: null }),
          ...(surplus.orderConfirmed ? { orderConfirmed: false } : {}),
        },
      });
    }
  }

  /** What a kept row changes to; empty when nothing changes. */
  private keptValues(
    stored: StoredCharacteristicRow,
    entry: IncomingCharacteristicEntry,
  ): CharacteristicRowValues {
    if (stored.orderConfirmed && !entry.orderConfirmed) {
      return {};
    }
    const values: CharacteristicRowValues = {};
    if (
      entry.advancementOrder !== undefined &&
      entry.advancementOrder !== stored.advancementOrder
    ) {
      values.advancementOrder = entry.advancementOrder;
    }
    if (entry.orderConfirmed && !stored.orderConfirmed) {
      values.orderConfirmed = true;
    }
    return values;
  }

  /** The entry's own order, or the next appended one when it gives none. */
  private orderFor(
    entry: IncomingCharacteristicEntry,
    appender: Appender,
  ): number | null {
    if (entry.advancementOrder !== undefined) {
      return entry.advancementOrder;
    }
    appender.highest += 1;
    return appender.highest;
  }

  private push(
    plan: CharacteristicPlan,
    id: number,
    values: CharacteristicRowValues,
  ): void {
    if (Object.keys(values).length > 0) {
      plan.updates.push({ id, values });
    }
  }

  /** Confirmed first, then ordered, then unordered; ties by order. */
  private compare(a: Ranked, b: Ranked): number {
    return (
      this.rank(a) - this.rank(b) ||
      (a.advancementOrder ?? 0) - (b.advancementOrder ?? 0)
    );
  }

  private rank(item: Ranked): number {
    if (item.orderConfirmed) {
      return 0;
    }
    return typeof item.advancementOrder === 'number' ? 1 : 2;
  }
}
