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

/** A stored curated row as the diff needs it. */
interface StoredCuratedRow {
  id: number;
  key: string;
  removed: boolean;
}

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
      await this.syncIncluded(tx, trophyId, curation.included);
    }
    if (curation.excluded !== undefined) {
      await this.syncExcluded(tx, trophyId, curation.excluded);
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

  private async syncIncluded(
    tx: DbOrTx,
    trophyId: number,
    desired: readonly RuleEventType[],
  ): Promise<void> {
    const table = trophyAwardRuleMatchEventTypes;
    const stored = await tx
      .select({
        id: table.id,
        actionType: table.actionType,
        consequenceType: table.consequenceType,
        removed: table.removed,
      })
      .from(table)
      .where(eq(table.trophyId, trophyId));
    const diff = this.diff(
      stored.map((row) => ({
        id: row.id,
        key: this.eventTypeKey(row),
        removed: row.removed,
      })),
      new Map(desired.map((entry) => [this.eventTypeKey(entry), entry])),
    );
    if (diff.toInsert.length > 0) {
      await tx.insert(table).values(
        diff.toInsert.map((entry) => ({
          trophyId,
          actionType: entry.actionType ?? null,
          consequenceType: entry.consequenceType ?? null,
        })),
      );
    }
    if (diff.reviveIds.length > 0) {
      await tx
        .update(table)
        .set({ removed: false })
        .where(inArray(table.id, diff.reviveIds));
    }
    if (diff.removeIds.length > 0) {
      await tx
        .update(table)
        .set({ removed: true })
        .where(inArray(table.id, diff.removeIds));
    }
  }

  private async syncExcluded(
    tx: DbOrTx,
    trophyId: number,
    desired: readonly RuleEventType[],
  ): Promise<void> {
    const table = trophyAwardRuleExcludedMatchEventTypes;
    const stored = await tx
      .select({
        id: table.id,
        actionType: table.actionType,
        consequenceType: table.consequenceType,
        removed: table.removed,
      })
      .from(table)
      .where(eq(table.trophyId, trophyId));
    const diff = this.diff(
      stored.map((row) => ({
        id: row.id,
        key: this.eventTypeKey(row),
        removed: row.removed,
      })),
      new Map(desired.map((entry) => [this.eventTypeKey(entry), entry])),
    );
    if (diff.toInsert.length > 0) {
      await tx.insert(table).values(
        diff.toInsert.map((entry) => ({
          trophyId,
          actionType: entry.actionType ?? null,
          consequenceType: entry.consequenceType ?? null,
        })),
      );
    }
    if (diff.reviveIds.length > 0) {
      await tx
        .update(table)
        .set({ removed: false })
        .where(inArray(table.id, diff.reviveIds));
    }
    if (diff.removeIds.length > 0) {
      await tx
        .update(table)
        .set({ removed: true })
        .where(inArray(table.id, diff.removeIds));
    }
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
    const diff = this.diff(
      stored.map((row) => ({
        id: row.id,
        key: row.positionNameExternalId,
        removed: row.removed,
      })),
      new Map(desired.map((id) => [id, id])),
    );
    if (diff.toInsert.length > 0) {
      await tx.insert(table).values(
        diff.toInsert.map((positionNameExternalId) => ({
          trophyId,
          positionNameExternalId,
        })),
      );
    }
    if (diff.reviveIds.length > 0) {
      await tx
        .update(table)
        .set({ removed: false })
        .where(inArray(table.id, diff.reviveIds));
    }
    if (diff.removeIds.length > 0) {
      await tx
        .update(table)
        .set({ removed: true })
        .where(inArray(table.id, diff.removeIds));
    }
  }

  /**
   * Compare stored rows with the curated set, both keyed by the pair a row
   * names. A key stored at all — removed or not — is never inserted again:
   * the table's unique constraint covers removed rows too, so a re-listed
   * key is revived instead.
   */
  private diff<T>(
    stored: readonly StoredCuratedRow[],
    desired: ReadonlyMap<string, T>,
  ): CurationDiff<T> {
    const storedKeys = new Set(stored.map((row) => row.key));
    return {
      toInsert: [...desired]
        .filter(([key]) => !storedKeys.has(key))
        .map(([, value]) => value),
      reviveIds: stored
        .filter((row) => row.removed && desired.has(row.key))
        .map((row) => row.id),
      removeIds: stored
        .filter((row) => !row.removed && !desired.has(row.key))
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
