import type {
  CharacteristicFormat,
  PositionRulesSetEntry,
  SyncPositionRulesSets,
  SyncPositionRulesSetsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewPositionRulesSet } from '@blood-bowl-tracker/db';
import { DB, positionRulesSets, rulesSets } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

/**
 * An entry whose characteristics disagree with what its rules set declares:
 * a value supplied for a characteristic the rules set does not have, a
 * missing value for one it does, or a rules set that does not exist at all.
 * Authored-data feedback, not a server fault — the API maps it to
 * BAD_REQUEST so an importer reports it against the offending entry.
 */
export class PositionRulesSetFormatMismatchError extends Error {}

/** The rules set's five format columns, as loaded for validation. */
interface RulesSetFormats {
  moveFormat: CharacteristicFormat;
  strengthFormat: CharacteristicFormat;
  agilityFormat: CharacteristicFormat;
  passingFormat: CharacteristicFormat;
  armourFormat: CharacteristicFormat;
}

/** The five characteristic columns, without the identifying pair. */
interface CharacteristicValues {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/**
 * The five characteristics, each paired with the rules-set column declaring
 * its format and the human-readable name used in error messages. Iterating
 * this list is what keeps validation exhaustive: a sixth characteristic means
 * one more line here, not five more branches.
 */
const CHARACTERISTICS = [
  { key: 'move', format: 'moveFormat', label: 'Move' },
  { key: 'strength', format: 'strengthFormat', label: 'Strength' },
  { key: 'agility', format: 'agilityFormat', label: 'Agility' },
  { key: 'passing', format: 'passingFormat', label: 'Passing' },
  { key: 'armour', format: 'armourFormat', label: 'Armour' },
] as const satisfies readonly {
  key: keyof CharacteristicValues;
  format: keyof RulesSetFormats;
  label: string;
}[];

/**
 * Owns the position × rules-set association: the position's characteristics
 * under one rules set.
 *
 * This is the single place enforcing "characteristics must match what the
 * rules set declares". Every writer goes through it — the curated manual
 * import today, the BBL and TP imports in the sibling issues — so none of
 * them re-implements the rule, and none can write a Passing value for a
 * rules set that has no Passing characteristic.
 */
@Injectable()
export class PositionRulesSetsService {
  constructor(@Inject(DB) private readonly db: Db) {}

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
   * fails the call rather than half-applying it.
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
    for (const entry of data.entries) {
      this.validate(entry, formatsById.get(entry.rulesSetId));
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
   * Reject an entry that disagrees with its rules set: an `absent` format
   * requires the value to be null, and any other format requires a number.
   */
  private validate(
    entry: PositionRulesSetEntry,
    formats: RulesSetFormats | undefined,
  ): void {
    if (formats === undefined) {
      throw new PositionRulesSetFormatMismatchError(
        `Rules set ${entry.rulesSetId} does not exist, so position ${entry.positionId} cannot have characteristics under it`,
      );
    }
    for (const characteristic of CHARACTERISTICS) {
      const value = entry[characteristic.key];
      const format = formats[characteristic.format];
      if (format === 'absent' && value !== null) {
        throw new PositionRulesSetFormatMismatchError(
          `Rules set ${entry.rulesSetId} has no ${characteristic.label} characteristic, but position ${entry.positionId} supplies one`,
        );
      }
      if (format !== 'absent' && value === null) {
        throw new PositionRulesSetFormatMismatchError(
          `Rules set ${entry.rulesSetId} requires a ${characteristic.label} characteristic, but position ${entry.positionId} supplies none`,
        );
      }
    }
  }

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
