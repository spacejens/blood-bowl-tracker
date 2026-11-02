import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type {
  PlayerCharacteristic,
  PlayerCharacteristicCounts,
} from '@blood-bowl-tracker/domain-enums';
import { PLAYER_CHARACTERISTICS } from '@blood-bowl-tracker/domain-enums';
import type { StoredPlayerAdvancement } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/** Options for {@link TpAdvancementOrderService.liveEntries}. */
export interface LiveAdvancementEntriesOptions {
  playerId: number;
  /** The player's deduplicated skill entries; gained ones carry TP's list position. */
  skillEntries: PlayerSkillEntry[];
  /** Undefined when this import could not derive the increases. */
  increases: PlayerCharacteristicCounts | undefined;
  /** Every active advancement row stored for the player before this import. */
  stored: StoredPlayerAdvancement[];
  /**
   * True when TP's reported spend can be checked. A lone new advancement is
   * then left pending like several are, so the spend can confirm it.
   */
  checkSpend?: boolean;
  /**
   * True for the bulk import. A bulk snapshot may come long after the stored
   * rows were written, so a player with a stored confirmed paid advancement
   * is sent as TP lists him, with nothing numbered as new and nothing
   * pending; one without is planned as if no paid advancement were stored.
   */
  bulk?: boolean;
}

/** The entries the live import sends for one player, and what is left to deduce. */
export interface LiveAdvancementPlan {
  entries: PlayerSkillEntry[];
  /**
   * Indexes into `entries` of the advancements whose order must be deduced
   * from SPP: every paid one when the player is planned as having nothing
   * stored and `checkSpend` is set; otherwise empty unless a player with stored rows
   * gained at least two new advancements, or one when `checkSpend` is set.
   * Listed in the fallback order (TP's skill list order, then increases in
   * stat-line order); those entries are sent unconfirmed at `firstNumber`,
   * `firstNumber + 1`, ... in that order.
   */
  pendingIndexes: number[];
  /** The advancement number after the player's stored paid advancements. */
  firstNumber: number;
}

/** The stored increases to resend, and the characteristics newly increased. */
interface IncreaseSplit {
  kept: PlayerSkillEntry[];
  added: PlayerCharacteristic[];
}

/**
 * Decides the order the TP roster import sends with a player's advancements.
 *
 * The live import runs right after a match, so an advancement not stored
 * before was taken since the last import and comes after every stored one.
 * Its confirmed order is its number among the player's paid advancements
 * (neither starting skills nor free extras), the numbering the cost rows use.
 * A lone new advancement is sent confirmed at the next number when TP's spend
 * cannot be checked; when it can, it is sent unconfirmed at the next number
 * and marked pending, so a stored history the spend does not allow leaves it
 * unconfirmed instead of pinning it wrongly. Several are sent unconfirmed at
 * the next numbers, in TP's skill order then stat-line order, and marked
 * pending so their order can be deduced from SPP. A player with nothing
 * stored, in either import, has every paid advancement numbered from 1 in
 * TP's skill order then stat-line order, unconfirmed and pending when the
 * spend can be checked, so the spend can confirm the order; this numbering
 * replaces TP's list position, which counts free extras and leaves out
 * increases. A free extra keeps its TP list position, unconfirmed: that
 * number is outside the paid numbering and can equal a paid advancement's,
 * which the cost model and the deepdive allow for. An entry counts as a free
 * extra by its `isFreeExtra` flag alone; the caller sets it beforehand on
 * every skill the write stores free, not only on those TP flags `isExtra`
 * (PlayerAdvancementReadsService.resolveFreeExtras). In a bulk import only a
 * stored paid advancement with a confirmed order is history to keep: a bulk
 * player with one cannot tell when the rest was taken, so it sends the skills
 * as TP lists them and each increase with an unknown order. A bulk player
 * with none (nothing stored, only starting skills or free extras, or only
 * paid advancements of unconfirmed order) is numbered from 1 as if no paid
 * advancement were stored, so a later bulk pass, for one after the
 * advancement costs exist, can confirm what an earlier pass left unconfirmed.
 * Stored increases are resent as stored, best-ranked first, so the server
 * keeps them.
 *
 * Pure decision logic, with no I/O, no dependencies and no external state.
 */
@Injectable()
export class TpAdvancementOrderService {
  /** One entry of unknown order per increase, in stat-line order. */
  characteristicEntries(
    playerId: number,
    increases: PlayerCharacteristicCounts | undefined,
  ): PlayerSkillEntry[] {
    if (increases === undefined) {
      return [];
    }
    return PLAYER_CHARACTERISTICS.flatMap((characteristic) =>
      Array.from({ length: increases[characteristic] }, (): PlayerSkillEntry =>
        this.increaseEntry(playerId, characteristic, null),
      ),
    );
  }

  /** The entries for one player, ordered as described above. */
  liveEntries(options: LiveAdvancementEntriesOptions): LiveAdvancementPlan {
    const { playerId, skillEntries, increases } = options;
    const stored = this.plannedStored(options);
    const storedPaid = stored.filter((row) => this.isPaid(row));
    const firstNumber = storedPaid.length + 1;
    // Only stored confirmed paid rows are a history the bulk import must
    // keep. A live import counts any stored row: it runs right after a
    // match, so what is not stored yet is new.
    const hasPaidBaseline = storedPaid.length > 0;
    const hasBaseline =
      options.bulk === true ? hasPaidBaseline : stored.length > 0;
    if (hasPaidBaseline && options.bulk === true) {
      return {
        entries: [
          ...skillEntries,
          ...this.characteristicEntries(playerId, increases),
        ],
        pendingIndexes: [],
        firstNumber,
      };
    }
    const newSkills = this.newSkills(skillEntries, stored);
    const { kept, added } = this.increases({ ...options, stored });
    const newCount = newSkills.size + added.length;
    // Without a baseline every paid advancement counts as new, and only the
    // spend can confirm their order.
    const pending =
      options.checkSpend === true || (hasBaseline && newCount > 1);
    const confirmation =
      pending || !hasBaseline ? {} : { orderConfirmed: true };
    const entries: PlayerSkillEntry[] = [];
    const pendingIndexes: number[] = [];
    let next = firstNumber;
    const pushNew = (entry: PlayerSkillEntry): void => {
      if (pending) {
        pendingIndexes.push(entries.length);
      }
      entries.push({ ...entry, advancementOrder: next, ...confirmation });
      next += 1;
    };
    for (const entry of skillEntries) {
      if (newSkills.has(entry)) {
        pushNew(entry);
      } else {
        entries.push(entry);
      }
    }
    entries.push(...kept);
    for (const characteristic of added) {
      pushNew(this.increaseEntry(playerId, characteristic, null));
    }
    return { entries, pendingIndexes, firstNumber };
  }

  /**
   * The stored rows the plan works from. A bulk player with no confirmed
   * paid row has no history to keep: his unconfirmed paid rows (left by an
   * earlier pass that could not deduce their order, for one, before the
   * advancement costs existed) are planned as if not stored, so they are
   * numbered afresh and the spend can confirm them. The sync still matches
   * and rewrites those rows. Starting skills and free extras stay, as they
   * are never numbered as paid.
   */
  private plannedStored(
    options: LiveAdvancementEntriesOptions,
  ): StoredPlayerAdvancement[] {
    const { stored } = options;
    if (
      options.bulk !== true ||
      stored.some((row) => this.isPaid(row) && row.orderConfirmed)
    ) {
      return stored;
    }
    return stored.filter((row) => !this.isPaid(row));
  }

  /** Neither a starting skill nor a free extra. */
  private isPaid(row: StoredPlayerAdvancement): boolean {
    return row.source !== 'starting' && !row.isFreeExtra;
  }

  /** Gained, non-free skill entries whose skill and variant are not stored. */
  private newSkills(
    skillEntries: PlayerSkillEntry[],
    stored: StoredPlayerAdvancement[],
  ): Set<PlayerSkillEntry> {
    const storedKeys = new Set(
      stored.flatMap((row) =>
        row.skillId === null ? [] : [this.key(row.skillId, row.attributeValue)],
      ),
    );
    return new Set(
      skillEntries.filter(
        (entry) =>
          entry.source !== 'starting' &&
          entry.isFreeExtra !== true &&
          !storedKeys.has(
            this.key(entry.skillId ?? null, entry.attributeValue ?? null),
          ),
      ),
    );
  }

  /**
   * The stored increases to resend (at most the current count per
   * characteristic, best-ranked first) and one characteristic per increase
   * above the stored count. Nothing when the increases are unknown.
   */
  private increases(options: LiveAdvancementEntriesOptions): IncreaseSplit {
    const { playerId, increases, stored } = options;
    const split: IncreaseSplit = { kept: [], added: [] };
    if (increases === undefined) {
      return split;
    }
    for (const characteristic of PLAYER_CHARACTERISTICS) {
      const rows = stored
        .filter((row) => row.characteristic === characteristic)
        .sort(
          (a, b) =>
            this.rank(a) - this.rank(b) ||
            (a.advancementOrder ?? 0) - (b.advancementOrder ?? 0),
        );
      for (const row of rows.slice(0, increases[characteristic])) {
        split.kept.push({
          ...this.increaseEntry(playerId, characteristic, row.advancementOrder),
          ...(row.orderConfirmed ? { orderConfirmed: true } : {}),
        });
      }
      for (let have = rows.length; have < increases[characteristic]; have++) {
        split.added.push(characteristic);
      }
    }
    return split;
  }

  private increaseEntry(
    playerId: number,
    characteristic: PlayerCharacteristic,
    advancementOrder: number | null,
  ): PlayerSkillEntry {
    return {
      playerId,
      source: 'characteristic',
      characteristic,
      advancementOrder,
    };
  }

  private key(skillId: number | null, attributeValue: string | null): string {
    return JSON.stringify([skillId, attributeValue]);
  }

  /** Confirmed first, then ordered, then unordered. */
  private rank(row: StoredPlayerAdvancement): number {
    if (row.orderConfirmed) {
      return 0;
    }
    return row.advancementOrder === null ? 2 : 1;
  }
}
