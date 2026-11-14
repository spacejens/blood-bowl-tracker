import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type { PlayerSkillSource } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';
import type {
  CharacteristicWrites,
  ExistingRow,
  FreeExtraFacts,
  PlayerSkillUpdate,
  ResolvedCharacteristic,
  ResolvedEntries,
  ResolvedPlayerSkill,
  SkillInsert,
  SkillWrites,
} from './player-advancement-sync.types';

/**
 * The curated names of the skills a player only ever gains as free extras:
 * BB2025 grants Hatred on top of a player's advancements, never as one, and
 * a Loner can be gained without spending SPP; a journeyman's own Loner is a
 * starting skill JourneymanLonerService keeps, not a gained one. The source
 * is trusted to add a gained Loner only where it applies. The name alone is
 * each skill's identity: their variants (Hatred's target, Loner's roll) live
 * in `attribute_value`.
 */
export const FREE_EXTRA_SKILL_NAMES: readonly string[] = ['Hatred', 'Loner'];

/**
 * Decides which advancement rows a `PlayerSkillsService.sync` batch writes,
 * given the rows already stored for the batch's players: skill rows matched
 * on their natural key, characteristic rows reconciled per listed player
 * through CharacteristicAdvancementPlannerService. Ids of stored rows that
 * stand for an entry go straight into the caller's `resultIds`. Also owns the
 * rule for which skill entries are free extras (`isFreeExtra`), shared with
 * PlayerAdvancementReadsService.resolveFreeExtras.
 *
 * Pure decision logic, with no I/O and no external state; its one
 * collaborator is pure too.
 */
@Injectable()
export class PlayerAdvancementSyncPlannerService {
  constructor(
    private readonly planner: CharacteristicAdvancementPlannerService,
  ) {}

  /** The natural key a skill row is matched on: player, skill and variant. */
  naturalKey(
    playerId: number,
    skillId: number | null,
    attributeValue: string | null,
  ): string {
    return JSON.stringify([playerId, skillId, attributeValue]);
  }

  /**
   * Whether a skill entry is stored as a free extra: the source flags it, it
   * is a non-`starting` skill the name rule covers
   * (`FREE_EXTRA_SKILL_NAMES`), or (for any other skill) one of the player's
   * own trophy awards grants it. The trophy rule never applies to a
   * name-rule skill or to a `starting` entry: a starting skill is not gained, so it holds no
   * slot a trophy could make free.
   */
  isFreeExtra(
    entry: PlayerSkillEntry,
    skillId: number,
    facts: FreeExtraFacts,
  ): boolean {
    if (entry.isFreeExtra === true) {
      return true;
    }
    if (facts.freeExtraSkillIds.has(skillId)) {
      return entry.source !== 'starting';
    }
    return (
      entry.source !== 'starting' &&
      facts.grantedSkillIdsByPlayer.get(entry.playerId)?.has(skillId) === true
    );
  }

  /**
   * Player id -> the skills that player's trophy awards grant. An award
   * with no player or no granted skill grants nothing.
   */
  grantedSkillIdsByPlayer(
    awards: { playerId: number | null; grantedSkillId: number | null }[],
  ): Map<number, Set<number>> {
    const granted = new Map<number, Set<number>>();
    for (const { playerId, grantedSkillId } of awards) {
      if (playerId === null || grantedSkillId === null) {
        continue;
      }
      granted.set(
        playerId,
        (granted.get(playerId) ?? new Set<number>()).add(grantedSkillId),
      );
    }
    return granted;
  }

  /**
   * Match each skill entry to its stored row by natural key: an unmatched one
   * becomes an insert, a matched one an update of whatever changed. A
   * matched removed row is revived.
   */
  planSkills(
    resolved: ResolvedPlayerSkill[],
    existingRows: ExistingRow[],
    resultIds: number[],
  ): SkillWrites {
    // Characteristic rows are not skills and never match a skill entry.
    const existingByKey = new Map(
      existingRows
        .filter((row) => row.source !== 'characteristic')
        .map((row) => [
          this.naturalKey(row.playerId, row.skillId, row.attributeValue),
          row,
        ]),
    );
    const writes: SkillWrites = {
      updates: [],
      inserts: [],
      changedPlayerIds: [],
    };
    for (const row of resolved) {
      const existing = existingByKey.get(
        this.naturalKey(row.playerId, row.skillId, row.attributeValue),
      );
      if (existing === undefined) {
        writes.inserts.push(this.skillInsert(row));
        writes.changedPlayerIds.push(row.playerId);
        continue;
      }
      resultIds[row.index] = existing.id;
      const values = this.skillUpdateValues(existing, row);
      if (Object.keys(values).length > 0) {
        writes.updates.push({ id: existing.id, values });
        writes.changedPlayerIds.push(existing.playerId);
      }
    }
    return writes;
  }

  /**
   * Close the numbering slot of each confirmed free extra. A source that
   * numbers every advancement it lists (BBL) can number one that resolves as
   * a free extra, which is not one of the player's paid advancements. Each
   * confirmed paid skill or increase of that player numbered after such a
   * slot moves down one per slot, so skills and increases keep one paid
   * numbering from 1. A free row is passed on unconfirmed, keeping its number
   * as a record of where the source listed it. A skill counts as free when
   * its entry resolves free or its stored row already is.
   */
  closeFreeExtraSlots(
    resolved: ResolvedEntries,
    existingRows: ExistingRow[],
  ): ResolvedEntries {
    const storedFreeKeys = new Set(
      existingRows
        .filter((row) => row.source !== 'characteristic' && row.isFreeExtra)
        .map((row) =>
          this.naturalKey(row.playerId, row.skillId, row.attributeValue),
        ),
    );
    const isFree = (row: ResolvedPlayerSkill): boolean =>
      row.source !== 'starting' &&
      (row.isFreeExtra ||
        storedFreeKeys.has(
          this.naturalKey(row.playerId, row.skillId, row.attributeValue),
        ));
    const slotsByPlayer = new Map<number, number[]>();
    for (const row of resolved.skills) {
      if (
        isFree(row) &&
        row.orderConfirmed &&
        typeof row.advancementOrder === 'number'
      ) {
        const slots = slotsByPlayer.get(row.playerId) ?? [];
        slots.push(row.advancementOrder);
        slotsByPlayer.set(row.playerId, slots);
      }
    }
    const renumber = <T extends ResolvedPlayerSkill | ResolvedCharacteristic>(
      row: T,
    ): T => {
      const order = row.advancementOrder;
      const slots = slotsByPlayer.get(row.playerId);
      if (!row.orderConfirmed || typeof order !== 'number' || !slots) {
        return row;
      }
      const below = slots.filter((slot) => slot < order).length;
      return below === 0 ? row : { ...row, advancementOrder: order - below };
    };
    return {
      skills: resolved.skills.map((row) => {
        if (!isFree(row)) {
          return renumber(row);
        }
        return row.orderConfirmed ? { ...row, orderConfirmed: false } : row;
      }),
      characteristics: resolved.characteristics.map(renumber),
    };
  }

  /** Every listed player's characteristic rows, planned against what is stored. */
  planCharacteristics(
    batch: {
      characteristics: ResolvedCharacteristic[];
      playerIds: ReadonlySet<number>;
      entries: PlayerSkillEntry[];
    },
    existingRows: ExistingRow[],
    resultIds: number[],
  ): CharacteristicWrites {
    const writes: CharacteristicWrites = {
      updates: [],
      inserts: [],
      changedPlayerIds: [],
    };
    for (const playerId of batch.playerIds) {
      const plan = this.planner.plan({
        stored: existingRows.flatMap((row) =>
          row.playerId === playerId &&
          row.source === 'characteristic' &&
          row.characteristic !== null
            ? [
                {
                  id: row.id,
                  characteristic: row.characteristic,
                  advancementOrder: row.advancementOrder,
                  orderConfirmed: row.orderConfirmed === true,
                  removed: row.removed === true,
                },
              ]
            : [],
        ),
        incoming: batch.characteristics.filter(
          (entry) => entry.playerId === playerId,
        ),
        highestOrder: this.highestOrder(playerId, existingRows, batch.entries),
      });
      plan.existingIdsByIndex.forEach((id, index) => {
        resultIds[index] = id;
      });
      writes.updates.push(...plan.updates);
      writes.inserts.push(
        ...plan.inserts.map((insert) => ({ ...insert, playerId })),
      );
      if (plan.updates.length > 0 || plan.inserts.length > 0) {
        writes.changedPlayerIds.push(playerId);
      }
    }
    return writes;
  }

  /** The new row for a skill entry with no stored row. */
  private skillInsert(row: ResolvedPlayerSkill): SkillInsert {
    return {
      index: row.index,
      values: {
        playerId: row.playerId,
        skillId: row.skillId,
        source: row.source,
        attributeValue: row.attributeValue,
        // A starting row never carries a sequence, regardless of what the
        // entry says: the schema already rejects a numeric order paired with
        // `starting`, but this stays an explicit, unconditional `null` here
        // rather than relying on that alone.
        advancementOrder:
          row.source === 'starting' ? null : (row.advancementOrder ?? null),
        // Only a confirmed or free row names that column; every other row
        // takes its `false` default. A free extra is not one of the paid
        // advancements, so its order is never stored confirmed.
        ...(row.orderConfirmed && !row.isFreeExtra
          ? { orderConfirmed: true }
          : {}),
        ...(row.isFreeExtra ? { isFreeExtra: true } : {}),
      },
    };
  }

  /** What a matched skill row changes to; empty when nothing changes. */
  private skillUpdateValues(
    existing: ExistingRow,
    row: ResolvedPlayerSkill,
  ): PlayerSkillUpdate['values'] {
    const values: PlayerSkillUpdate['values'] = {};
    if (this.sourceChanges(existing.source, row.source)) {
      values.source = row.source;
    }
    if (row.source === 'starting') {
      // The resolved source is (or is becoming) `starting`, which has no
      // sequence at all — clear any previously-stored order even though the
      // entry itself did not mention `advancementOrder`, and with it any
      // confirmation, which cannot stand without an order.
      if (existing.advancementOrder !== null) {
        values.advancementOrder = null;
      }
      if (existing.orderConfirmed) {
        values.orderConfirmed = false;
      }
    } else if (row.isFreeExtra || existing.isFreeExtra) {
      // A free extra is not one of the paid advancements, so its order is
      // never confirmed: the entry's order is kept as a record of where the
      // source listed it, and a stored confirmation is cleared.
      if (
        row.advancementOrder !== undefined &&
        row.advancementOrder !== existing.advancementOrder
      ) {
        values.advancementOrder = row.advancementOrder;
      }
      if (existing.orderConfirmed) {
        values.orderConfirmed = false;
      }
    } else if (!existing.orderConfirmed || row.orderConfirmed) {
      // An unconfirmed order never overwrites a confirmed one.
      if (
        row.advancementOrder !== undefined &&
        row.advancementOrder !== existing.advancementOrder
      ) {
        values.advancementOrder = row.advancementOrder;
      }
      if (row.orderConfirmed && !existing.orderConfirmed) {
        values.orderConfirmed = true;
      }
    }
    // Set-only: a row once free stays free, whatever a later entry says.
    if (row.isFreeExtra && !existing.isFreeExtra) {
      values.isFreeExtra = true;
    }
    // A removed skill row is always a starting row (a recruited journeyman's
    // Loner, say); a source listing that skill again revives the row with
    // the entry's values, so its natural key is never left blocked.
    if (existing.removed) {
      values.removed = false;
    }
    return values;
  }

  /**
   * Whether an entry's source replaces the stored one. A stored `chosen` or
   * `random` is kept when the entry only says `advancement`: that is the
   * generic source a system that cannot tell the two apart (BBL) sends every
   * time, and the stored value is the more specific record of the same
   * skill, settled by BblSkillSourceInferenceService or by the source itself.
   * Overwriting it would make every unchanged re-run write a row.
   */
  private sourceChanges(
    stored: PlayerSkillSource,
    incoming: PlayerSkillSource,
  ): boolean {
    if (
      incoming === 'advancement' &&
      (stored === 'chosen' || stored === 'random')
    ) {
      return false;
    }
    return incoming !== stored;
  }

  /**
   * The player's highest order over their stored active rows and the batch's
   * own orders for them; 0 when there is none.
   */
  private highestOrder(
    playerId: number,
    existingRows: ExistingRow[],
    entries: PlayerSkillEntry[],
  ): number {
    const orders = [
      ...existingRows
        .filter((row) => row.playerId === playerId && row.removed !== true)
        .map((row) => row.advancementOrder),
      ...entries
        .filter((entry) => entry.playerId === playerId)
        .map((entry) => entry.advancementOrder),
    ].filter((order): order is number => typeof order === 'number');
    return Math.max(0, ...orders);
  }
}
