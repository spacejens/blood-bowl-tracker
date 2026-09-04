import type {
  CharacteristicFormat,
  PositionRulesSetEntry,
  SyncPositionRulesSets,
  SyncPositionRulesSetsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewPositionRulesSet } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  eras,
  positionRulesSets,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, min, sql } from 'drizzle-orm';

import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import type { CharacteristicValues } from '../shared/characteristic-format-validation.service';
import { CharacteristicFormatValidationService } from '../shared/characteristic-format-validation.service';

/**
 * A position's stat line under one rules set, together with that rules set's
 * own declared display formats. The formats travel with the values because
 * the whole point of showing several rules sets side by side is that they
 * differ: rendering them uniformly would hide exactly what the view exists to
 * show. `passing` is nullable, mirroring the column — a rules set whose
 * `passingFormat` is 'absent' has no Passing characteristic at all, and its
 * consumer omits the field rather than rendering a placeholder.
 */
export interface PositionCharacteristics {
  rulesSetId: number;
  rulesSetName: string;
  moveFormat: CharacteristicFormat;
  move: number;
  strengthFormat: CharacteristicFormat;
  strength: number;
  agilityFormat: CharacteristicFormat;
  agility: number;
  passingFormat: CharacteristicFormat;
  passing: number | null;
  armourFormat: CharacteristicFormat;
  armour: number;
}

/**
 * Everything needed to render one player's own characteristics: the display
 * formats of the rules set that applies to their era, and — when the position
 * has a recorded stat line under that rules set — the baseline those values
 * started from.
 *
 * `baseline` is optional rather than the whole context being absent because
 * "no baseline" is a real, renderable outcome: the formats are still known,
 * so the values are shown, just without any up/down comparison.
 */
export interface PositionCharacteristicsContext {
  moveFormat: CharacteristicFormat;
  strengthFormat: CharacteristicFormat;
  agilityFormat: CharacteristicFormat;
  passingFormat: CharacteristicFormat;
  armourFormat: CharacteristicFormat;
  baseline:
    | {
        move: number;
        strength: number;
        agility: number;
        passing: number | null;
        armour: number;
      }
    | undefined;
}

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
   * Every rules set this position has recorded characteristics for, oldest
   * first.
   *
   * "Oldest" is the earliest start date among the eras that list the rules
   * set (`era_rules_sets -> eras`), which is why the era tables are joined at
   * all — `rules_sets` itself carries no date. The joins are LEFT joins and
   * the ordering aggregate is `min(...)`: a rules set can be listed by
   * several eras, and one listed by none still belongs in the list (Postgres
   * sorts its NULL last under ASC, so an uncurated rules set falls to the
   * bottom rather than dropping out). Grouping by the two primary keys is
   * enough for Postgres to allow every other selected column, since each is
   * functionally dependent on one of them.
   */
  listByPosition(positionId: number): Promise<PositionCharacteristics[]> {
    return this.db
      .select({
        rulesSetId: rulesSets.id,
        rulesSetName: rulesSets.name,
        moveFormat: rulesSets.moveFormat,
        move: positionRulesSets.move,
        strengthFormat: rulesSets.strengthFormat,
        strength: positionRulesSets.strength,
        agilityFormat: rulesSets.agilityFormat,
        agility: positionRulesSets.agility,
        passingFormat: rulesSets.passingFormat,
        passing: positionRulesSets.passing,
        armourFormat: rulesSets.armourFormat,
        armour: positionRulesSets.armour,
      })
      .from(positionRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, positionRulesSets.rulesSetId))
      .leftJoin(eraRulesSets, eq(eraRulesSets.rulesSetId, rulesSets.id))
      .leftJoin(eras, eq(eras.id, eraRulesSets.eraId))
      .where(eq(positionRulesSets.positionId, positionId))
      .groupBy(positionRulesSets.id, rulesSets.id)
      .orderBy(asc(min(eras.startDate)), asc(rulesSets.name));
  }

  /**
   * Which rules set's formats — and which position baseline — apply to a
   * player of this position in this era.
   *
   * `players` stores its own characteristics but no rules set, and an era can
   * list several rules sets in sequence, so the rules set has to be resolved
   * rather than read. The preference is the era's *last-listed* rules set
   * (highest `era_rules_sets.id`, the only ordering signal either join table
   * carries) that also has a `position_rules_sets` row for this position:
   * that is the position "as it stood most recently in this era". A rules set
   * with no such row still supplies usable formats, so it is the fallback —
   * better than guessing a format — but yields no baseline. An era listing no
   * rules sets at all yields `undefined`: there is nothing to format with, so
   * the caller renders nothing.
   *
   * `baselineRulesSetId` is cast to an explicitly nullable type because it is
   * the left join's presence flag: the underlying column is `NOT NULL`, so
   * only the cast makes the "no matching row" case checkable at all.
   */
  async findCharacteristicsContext(
    positionId: number,
    eraId: number,
  ): Promise<PositionCharacteristicsContext | undefined> {
    const rows = await this.db
      .select({
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
        baselineRulesSetId: sql<number | null>`${positionRulesSets.id}`,
        baselineMove: positionRulesSets.move,
        baselineStrength: positionRulesSets.strength,
        baselineAgility: positionRulesSets.agility,
        baselinePassing: positionRulesSets.passing,
        baselineArmour: positionRulesSets.armour,
      })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .leftJoin(
        positionRulesSets,
        and(
          eq(positionRulesSets.rulesSetId, eraRulesSets.rulesSetId),
          eq(positionRulesSets.positionId, positionId),
        ),
      )
      .where(eq(eraRulesSets.eraId, eraId))
      // Postgres sorts false before true, so rows that did match the position
      // come first; among those, the last-listed era rules set wins.
      .orderBy(
        sql`(${positionRulesSets.id} is null) asc`,
        desc(eraRulesSets.id),
      )
      .limit(1);

    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }
    return {
      moveFormat: row.moveFormat,
      strengthFormat: row.strengthFormat,
      agilityFormat: row.agilityFormat,
      passingFormat: row.passingFormat,
      armourFormat: row.armourFormat,
      baseline:
        row.baselineRulesSetId === null
          ? undefined
          : {
              move: row.baselineMove,
              strength: row.baselineStrength,
              agility: row.baselineAgility,
              passing: row.baselinePassing,
              armour: row.baselineArmour,
            },
    };
  }

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
