import type {
  PositionRulesSetEntry,
  SyncPositionRulesSets,
  SyncPositionRulesSetsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewPositionRulesSet } from '@blood-bowl-tracker/db';
import { DB, positionRulesSets, rulesSets } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import type { CharacteristicValues } from '../shared/characteristic-format-validation.service';
import { CharacteristicFormatValidationService } from '../shared/characteristic-format-validation.service';

/**
 * Owns the position × rules-set association: the position's characteristics
 * under one rules set.
 *
 * Every writer of position characteristics goes through it, and it defers
 * the "characteristics must match what the rules set declares" check to the
 * shared CharacteristicFormatValidationService, so positions and players
 * apply one identical rule.
 */
@Injectable()
export class PositionRulesSetsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly characteristicFormats: CharacteristicFormatValidationService,
  ) {}

  /**
   * Insert or update the supplied rows, matched on their natural key
   * `(positionId, rulesSetId)`. Idempotent: re-syncing a pair rewrites its
   * characteristics in place rather than duplicating the row.
   *
   * Deliberately *not* `INSERT ... ON CONFLICT DO UPDATE`, for the same
   * reason SppAwardValuesService.sync is not: `position_rules_sets` is
   * history-tracked, and Postgres fires the row-level BEFORE INSERT
   * versioning trigger for every candidate row of an ON CONFLICT statement —
   * including candidates the conflict then turns into an UPDATE — writing a
   * history row keyed by a serial id that never lands in the parent table,
   * which breaks the history table's foreign key. Selecting first and then
   * issuing plain INSERT / UPDATE statements is the pattern
   * `upsertByExternalIds` uses, for the same reason.
   *
   * Validation runs over the whole batch before any write: one bad entry
   * fails the call rather than half-applying it. This includes rejecting a
   * batch where the same `(positionId, rulesSetId)` pair appears more than
   * once — without this check, two such entries would both route to the
   * insert path below and collide on the table's unique constraint, raising
   * a raw database error instead of this method's own, clearer one.
   */
  async sync(
    data: SyncPositionRulesSets,
  ): Promise<SyncPositionRulesSetsResult> {
    if (data.entries.length === 0) {
      return { positionRulesSetIds: [] };
    }

    const rulesSetIds = [
      ...new Set(data.entries.map((entry) => entry.rulesSetId)),
    ];
    const formatRows = await this.db
      .select({
        id: rulesSets.id,
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(rulesSets)
      .where(inArray(rulesSets.id, rulesSetIds));

    const formatsById = new Map(formatRows.map((row) => [row.id, row]));
    const seenKeys = new Set<string>();
    for (const entry of data.entries) {
      this.characteristicFormats.validate({
        values: this.characteristicValues(entry),
        formats: formatsById.get(entry.rulesSetId),
        rulesSetId: entry.rulesSetId,
        subject: `position ${entry.positionId}`,
      });
      const key = this.naturalKey(entry);
      if (seenKeys.has(key)) {
        throw new CharacteristicFormatMismatchError(
          `Position ${entry.positionId} under rules set ${entry.rulesSetId} appears more than once in the same batch`,
        );
      }
      seenKeys.add(key);
    }

    // Over-fetch by rules set and match in memory: one query regardless of
    // how many pairs the batch carries, and no null-safety awkwardness.
    const existingRows = await this.db
      .select({
        id: positionRulesSets.id,
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
      })
      .from(positionRulesSets)
      .where(inArray(positionRulesSets.rulesSetId, rulesSetIds));

    const existingIdByKey = new Map(
      existingRows.map((row) => [this.naturalKey(row), row.id]),
    );

    const toInsert: NewPositionRulesSet[] = [];
    const toUpdate: { id: number; values: CharacteristicValues }[] = [];
    for (const entry of data.entries) {
      const existingId = existingIdByKey.get(this.naturalKey(entry));
      if (existingId === undefined) {
        toInsert.push({
          positionId: entry.positionId,
          rulesSetId: entry.rulesSetId,
          ...this.characteristicValues(entry),
        });
      } else {
        toUpdate.push({
          id: existingId,
          values: this.characteristicValues(entry),
        });
      }
    }

    // One transaction around the insert and every update: the caller treats
    // this single call as one batch that either wholly succeeds or wholly
    // fails.
    return this.db.transaction(async (tx) => {
      const positionRulesSetIds: number[] = [];

      if (toInsert.length > 0) {
        const inserted = await tx
          .insert(positionRulesSets)
          .values(toInsert)
          .returning({ id: positionRulesSets.id });
        positionRulesSetIds.push(...inserted.map((row) => row.id));
      }

      for (const row of toUpdate) {
        const updated = await tx
          .update(positionRulesSets)
          .set(row.values)
          .where(eq(positionRulesSets.id, row.id))
          .returning({ id: positionRulesSets.id });
        positionRulesSetIds.push(...updated.map((updatedRow) => updatedRow.id));
      }

      return { positionRulesSetIds };
    });
  }

  /**
   * The entry's five characteristic columns, without the identifying pair —
   * both what the shared validator checks and what gets written.
   */
  private characteristicValues(
    entry: PositionRulesSetEntry,
  ): CharacteristicValues {
    return {
      move: entry.move,
      strength: entry.strength,
      agility: entry.agility,
      passing: entry.passing,
      armour: entry.armour,
    };
  }

  /**
   * The row's natural key as a string, so existing rows and incoming entries
   * can be matched through a plain `Map`.
   */
  private naturalKey(row: { positionId: number; rulesSetId: number }): string {
    return `${row.positionId}|${row.rulesSetId}`;
  }
}
