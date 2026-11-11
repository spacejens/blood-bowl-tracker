import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type {
  PlayerCharacteristic,
  PlayerSkillSource,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

/** One stored advancement row of the player, as the match reads it. */
export interface CuratedOrderStoredRow {
  id: number;
  skillId: number | null;
  characteristic: PlayerCharacteristic | null;
  attributeValue: string | null;
  source: PlayerSkillSource;
  isFreeExtra: boolean;
  removed: boolean;
}

/** The stored paid rows in curated order, or why the entries do not fit them. */
export type CuratedOrderMatch =
  { ok: true; rowIdsInOrder: number[] } | { ok: false; problem: string };

/**
 * Pairs one player's hand-curated advancement order with his stored paid
 * advancements (gained skills that are not free extras, and characteristic
 * increases; never starting or removed rows). The entries must list every
 * paid advancement exactly once, each confirmed, numbered 1 to n. A skill
 * matches on skill and variant; an increase matches any unused increase of
 * the same characteristic, since those are interchangeable. A `problem`
 * reads after the player's name ("Player 12 has no paid ...").
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class CuratedAdvancementOrderMatcherService {
  match(
    entries: PlayerSkillEntry[],
    stored: CuratedOrderStoredRow[],
  ): CuratedOrderMatch {
    const shapeProblem = this.shapeProblem(entries);
    if (shapeProblem !== undefined) {
      return { ok: false, problem: shapeProblem };
    }
    const unused = stored.filter(
      (row) => row.source !== 'starting' && !row.isFreeExtra && !row.removed,
    );
    const paidCount = unused.length;
    const rowIdsInOrder: number[] = [];
    for (const entry of [...entries].sort(
      (a, b) => this.order(a) - this.order(b),
    )) {
      const at = unused.findIndex((row) => this.matches(entry, row));
      if (at === -1) {
        return {
          ok: false,
          problem: `has no paid advancement matching ${this.describe(entry)}`,
        };
      }
      rowIdsInOrder.push(unused[at].id);
      unused.splice(at, 1);
    }
    if (unused.length > 0) {
      return {
        ok: false,
        problem: `has ${paidCount} paid advancements, but the entries list ${entries.length}`,
      };
    }
    return { ok: true, rowIdsInOrder };
  }

  private shapeProblem(entries: PlayerSkillEntry[]): string | undefined {
    if (entries.length === 0) {
      return 'lists no advancements';
    }
    for (const entry of entries) {
      if (entry.source === 'starting' || entry.isFreeExtra === true) {
        return `lists ${this.describe(entry)}, which is not a paid advancement`;
      }
      if (
        entry.orderConfirmed !== true ||
        typeof entry.advancementOrder !== 'number'
      ) {
        return `lists ${this.describe(entry)} without a confirmed order`;
      }
    }
    const numbers = entries
      .map((entry) => this.order(entry))
      .sort((a, b) => a - b);
    if (!numbers.every((number, at) => number === at + 1)) {
      return `numbers its advancements ${numbers.join(', ')}, not 1 to ${entries.length}`;
    }
    return undefined;
  }

  /** The entry's number; shapeProblem has already required one. */
  private order(entry: PlayerSkillEntry): number {
    return entry.advancementOrder ?? 0;
  }

  private matches(
    entry: PlayerSkillEntry,
    row: CuratedOrderStoredRow,
  ): boolean {
    if (entry.source === 'characteristic') {
      return (
        row.source === 'characteristic' &&
        row.characteristic === entry.characteristic
      );
    }
    return (
      row.source !== 'characteristic' &&
      row.skillId === entry.skillId &&
      row.attributeValue === (entry.attributeValue ?? null)
    );
  }

  private describe(entry: PlayerSkillEntry): string {
    if (entry.source === 'characteristic') {
      return `a ${String(entry.characteristic)} increase`;
    }
    const variant = entry.attributeValue ? ` (${entry.attributeValue})` : '';
    return `skill ${String(entry.skillId)}${variant}`;
  }
}
