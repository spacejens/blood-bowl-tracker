import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import {
  eq,
  inArray,
  trophyAwardRuleEligiblePositions,
  trophyAwardRuleExcludedMatchEventTypes,
  trophyAwardRuleMatchEventTypes,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import type { DbOrTx } from '../shared/db-or-tx';

type RuleEventType = NonNullable<
  UpsertTrophy['awardRuleMatchEventTypes']
>[number];

/**
 * One upsert's curated rule arrays after `effectiveRuleCuration` has resolved
 * what an omitted array means for that upsert's award rule kind. `undefined`
 * leaves the corresponding table alone; an array is the complete set the
 * table should hold.
 */
interface RuleCuration {
  included: RuleEventType[] | undefined;
  excluded: RuleEventType[] | undefined;
  eligible: string[] | undefined;
}

type EventTypeTable =
  | typeof trophyAwardRuleMatchEventTypes
  | typeof trophyAwardRuleExcludedMatchEventTypes;

/** What one table needs written to hold exactly the curated set. */
interface CurationDiff<T> {
  toInsert: T[];
  reviveIds: number[];
  removeIds: number[];
}

interface EventTypeColumns {
  actionType?: string | null;
  consequenceType?: string | null;
}

/**
 * Syncs a trophy's curated award rule — its included and excluded match-event
 * types and its eligible positions — onto the transaction handle the trophy
 * upsert runs in, so the rule commits or rolls back with the trophy row.
 *
 * A diff, not a replace: the rows are history-tracked, and a tracked row can
 * never be deleted (docs/database.md). A curated row that is missing is
 * inserted; one the curation no longer lists is flagged `removed`; a flagged
 * row the curation lists again is revived rather than duplicated; and an
 * unchanged curation writes nothing at all, so re-running an import adds no
 * history.
 */
@Injectable()
export class TrophyRuleCurationSyncService {
  async sync(tx: DbOrTx, trophyId: number, data: UpsertTrophy): Promise<void> {
    const curation = this.effectiveRuleCuration(data);
    if (curation.included !== undefined) {
      await this.syncEventTypes({
        tx,
        table: trophyAwardRuleMatchEventTypes,
        trophyId,
        desired: curation.included,
      });
    }
    if (curation.excluded !== undefined) {
      await this.syncEventTypes({
        tx,
        table: trophyAwardRuleExcludedMatchEventTypes,
        trophyId,
        desired: curation.excluded,
      });
    }
    if (curation.eligible !== undefined) {
      await this.syncEligible(tx, trophyId, curation.eligible);
    }
  }

  /**
   * The three curated rule arrays as this upsert should apply them, where
   * `undefined` still means "leave that table's rows alone".
   *
   * Omitting an array normally means exactly that, matching how the scalar
   * columns overlay rather than reset. An upsert that declares a non-computed
   * kind (`direct_source` or `manual`) is the exception: such a trophy's
   * winner is recorded by the source or curated by hand, so it can hold no
   * match-event types and no eligible positions at all. Every array there is
   * forced to "none", whether it was omitted or supplied: an omitted one must
   * not leave the rule of a computed kind the trophy no longer has, and a
   * supplied one must not persist curation the kind cannot use.
   */
  private effectiveRuleCuration(data: UpsertTrophy): RuleCuration {
    const computes =
      data.awardRuleKind !== 'direct_source' && data.awardRuleKind !== 'manual';
    const cleared = <T>(value: T[] | undefined): T[] | undefined =>
      computes ? value : [];
    return {
      included: cleared(data.awardRuleMatchEventTypes),
      excluded: cleared(data.awardRuleExcludedMatchEventTypes),
      eligible: cleared(data.awardRuleEligiblePositions),
    };
  }

  private async syncEventTypes(options: {
    tx: DbOrTx;
    table: EventTypeTable;
    trophyId: number;
    desired: readonly RuleEventType[];
  }): Promise<void> {
    const { tx, table, trophyId, desired } = options;
    const stored = await tx
      .select({
        id: table.id,
        actionType: table.actionType,
        consequenceType: table.consequenceType,
        removed: table.removed,
      })
      .from(table)
      .where(eq(table.trophyId, trophyId));
    const diff = this.diff({
      stored,
      keyOf: (row) => this.eventTypeKey(row),
      desired: new Map(
        desired.map((entry) => [this.eventTypeKey(entry), entry]),
      ),
    });
    await this.applyDiff({
      diff,
      insert: (entries) =>
        tx.insert(table).values(
          entries.map((entry) => ({
            trophyId,
            actionType: entry.actionType ?? null,
            consequenceType: entry.consequenceType ?? null,
          })),
        ),
      setRemoved: (ids, removed) =>
        tx.update(table).set({ removed }).where(inArray(table.id, ids)),
    });
  }

  /**
   * The rows store each position's `Name`-system external id rather than a
   * position id, because they are curated before any `positions` row exists
   * (see the table's own comment).
   */
  private async syncEligible(
    tx: DbOrTx,
    trophyId: number,
    desired: readonly string[],
  ): Promise<void> {
    const table = trophyAwardRuleEligiblePositions;
    const stored = await tx
      .select({
        id: table.id,
        positionNameExternalId: table.positionNameExternalId,
        removed: table.removed,
      })
      .from(table)
      .where(eq(table.trophyId, trophyId));
    const diff = this.diff({
      stored,
      keyOf: (row) => row.positionNameExternalId,
      desired: new Map(desired.map((id) => [id, id])),
    });
    await this.applyDiff({
      diff,
      insert: (ids) =>
        tx.insert(table).values(
          ids.map((positionNameExternalId) => ({
            trophyId,
            positionNameExternalId,
          })),
        ),
      setRemoved: (ids, removed) =>
        tx.update(table).set({ removed }).where(inArray(table.id, ids)),
    });
  }

  /**
   * Write one table's diff through that table's own typed insert and update:
   * inserts first, then revivals, then removals. Nothing is written for an
   * empty part of the diff.
   */
  private async applyDiff<T>(options: {
    diff: CurationDiff<T>;
    insert: (entries: T[]) => PromiseLike<unknown>;
    setRemoved: (ids: number[], removed: boolean) => PromiseLike<unknown>;
  }): Promise<void> {
    const { diff, insert, setRemoved } = options;
    if (diff.toInsert.length > 0) {
      await insert(diff.toInsert);
    }
    if (diff.reviveIds.length > 0) {
      await setRemoved(diff.reviveIds, false);
    }
    if (diff.removeIds.length > 0) {
      await setRemoved(diff.removeIds, true);
    }
  }

  /**
   * Compare stored rows with the curated set, both keyed by the pair a row
   * names. A key stored at all, removed or not, is never inserted again:
   * the table's unique constraint covers removed rows too, so a re-listed
   * key is revived instead. Duplicate entries in the curated set collapse to
   * one through the map's keys.
   */
  private diff<S extends { id: number; removed: boolean }, T>(options: {
    stored: readonly S[];
    keyOf: (row: S) => string;
    desired: ReadonlyMap<string, T>;
  }): CurationDiff<T> {
    const { stored, keyOf, desired } = options;
    const storedKeys = new Set(stored.map(keyOf));
    return {
      toInsert: [...desired]
        .filter(([key]) => !storedKeys.has(key))
        .map(([, value]) => value),
      reviveIds: stored
        .filter((row) => row.removed && desired.has(keyOf(row)))
        .map((row) => row.id),
      removeIds: stored
        .filter((row) => !row.removed && !desired.has(keyOf(row)))
        .map((row) => row.id),
    };
  }

  /**
   * Exactly one of the two columns is set per row (the tables' check
   * constraint), and neither enum contains `|`, so this key is unique per
   * row the way the unique constraint is.
   */
  private eventTypeKey(row: EventTypeColumns): string {
    return `${row.actionType ?? ''}|${row.consequenceType ?? ''}`;
  }
}
