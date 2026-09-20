import type {
  KeywordKind,
  SyncPositionRulesSetKeywords,
  SyncPositionRulesSetKeywordsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewPositionRulesSetKeyword } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  eq,
  inArray,
  keywords,
  positionRulesSetKeywords,
  positionRulesSets,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { KeywordValidationError } from '../shared/keyword-validation-error';

/** One BB2025 keyword a position carries under one rules set, named. */
export interface PositionKeyword {
  rulesSetId: number;
  rulesSetName: string;
  keywordId: number;
  keywordName: string;
  kind: KeywordKind;
}

/** One entry with its `position_rules_sets` row already resolved. */
interface ResolvedKeyword {
  positionRulesSetId: number;
  keywordId: number;
}

/**
 * Owns the position × rules-set × keyword association.
 *
 * Callers key entries by `(positionId, rulesSetId, keywordId)`, never by the
 * internal `position_rules_sets.id` — they hold position and rules-set ids
 * from their own upserts. Resolving that row here is also what enforces the
 * table's anchoring rule: a keyword cannot be recorded for a
 * position/rules-set pair whose characteristics have not been synced yet.
 *
 * Unlike PositionRulesSetSkillsService there is no second precondition to
 * check: a keyword is not recorded per rules set, so there is no
 * "does this keyword exist under this rules set" row to look up.
 *
 * The row is its own natural key — there is no mutable payload column — so an
 * entry that already exists needs no write at all.
 */
@Injectable()
export class PositionRulesSetKeywordsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert any supplied keyword that is not already recorded, matched on its
   * natural key. Every validation runs over the whole batch before any write,
   * so one bad entry fails the call rather than half-applying it.
   */
  async sync(
    data: SyncPositionRulesSetKeywords,
  ): Promise<SyncPositionRulesSetKeywordsResult> {
    if (data.entries.length === 0) {
      return { positionRulesSetKeywordIds: [] };
    }

    const rulesSetIds = [
      ...new Set(data.entries.map((entry) => entry.rulesSetId)),
    ];
    const positionIds = [
      ...new Set(data.entries.map((entry) => entry.positionId)),
    ];

    // Fetch the anchor rows for just the positions and rules sets named in
    // this batch and match in memory: one query regardless of how many
    // entries the batch carries. Unlike PositionRulesSetSkillsService (called
    // once per import run with the whole batch already), this service is
    // called once per (position, rules set) pair, so an unscoped rules-set-only
    // filter would re-fetch every position under the rules set on every call.
    const associationRows = await this.db
      .select({
        id: positionRulesSets.id,
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
      })
      .from(positionRulesSets)
      .where(
        and(
          inArray(positionRulesSets.rulesSetId, rulesSetIds),
          inArray(positionRulesSets.positionId, positionIds),
        ),
      );

    const associationIdByKey = new Map(
      associationRows.map((row) => [
        `${row.positionId}|${row.rulesSetId}`,
        row.id,
      ]),
    );

    const resolved: ResolvedKeyword[] = [];
    const seenKeys = new Set<string>();
    for (const entry of data.entries) {
      const associationId = associationIdByKey.get(
        `${entry.positionId}|${entry.rulesSetId}`,
      );
      if (associationId === undefined) {
        throw new KeywordValidationError(
          `Position ${entry.positionId} has no characteristics recorded under rules set ${entry.rulesSetId}, so it cannot carry keywords there`,
        );
      }
      // Without this check, two entries for the same triple would both take
      // the insert path below and collide on the table's unique constraint,
      // raising a raw database error instead of this clearer one.
      const key = `${associationId}|${entry.keywordId}`;
      if (seenKeys.has(key)) {
        throw new KeywordValidationError(
          `Position ${entry.positionId} under rules set ${entry.rulesSetId} lists keyword ${entry.keywordId} more than once in the same batch`,
        );
      }
      seenKeys.add(key);
      resolved.push({
        positionRulesSetId: associationId,
        keywordId: entry.keywordId,
      });
    }

    const associationIds = [
      ...new Set(resolved.map((row) => row.positionRulesSetId)),
    ];
    const existingRows = await this.db
      .select({
        id: positionRulesSetKeywords.id,
        positionRulesSetId: positionRulesSetKeywords.positionRulesSetId,
        keywordId: positionRulesSetKeywords.keywordId,
      })
      .from(positionRulesSetKeywords)
      .where(
        inArray(positionRulesSetKeywords.positionRulesSetId, associationIds),
      );

    const existingIdByKey = new Map(
      existingRows.map((row) => [
        `${row.positionRulesSetId}|${row.keywordId}`,
        row.id,
      ]),
    );

    // `resultIds` is sized and indexed to `resolved` so the returned ids line
    // up positionally with `data.entries`, whether an entry was pre-existing
    // or newly inserted.
    const resultIds: number[] = new Array<number>(resolved.length);
    const toInsert: NewPositionRulesSetKeyword[] = [];
    const toInsertIndexes: number[] = [];
    for (const [index, row] of resolved.entries()) {
      const existing = existingIdByKey.get(
        `${row.positionRulesSetId}|${row.keywordId}`,
      );
      if (existing === undefined) {
        toInsert.push(row);
        toInsertIndexes.push(index);
        continue;
      }
      resultIds[index] = existing;
    }

    if (toInsert.length === 0) {
      return { positionRulesSetKeywordIds: resultIds };
    }

    // One transaction around the write: the caller treats this single call as
    // one batch that either wholly succeeds or wholly fails.
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(positionRulesSetKeywords)
        .values(toInsert)
        .returning({
          id: positionRulesSetKeywords.id,
          positionRulesSetId: positionRulesSetKeywords.positionRulesSetId,
          keywordId: positionRulesSetKeywords.keywordId,
        });
      // Postgres does not guarantee INSERT ... RETURNING preserves the input
      // `values()` order, so match by natural key rather than array position.
      const insertedIdByKey = new Map(
        inserted.map((row) => [
          `${row.positionRulesSetId}|${row.keywordId}`,
          row.id,
        ]),
      );
      toInsert.forEach((row, insertedIndex) => {
        const key = `${row.positionRulesSetId}|${row.keywordId}`;
        const id = insertedIdByKey.get(key);
        if (id === undefined) {
          // Every `toInsert` row was just inserted in this same statement, so
          // its key must be present — this can only mean the insert silently
          // dropped a row.
          throw new Error(
            `Insert into position_rules_set_keywords did not return a row for key ${key}`,
          );
        }
        resultIds[toInsertIndexes[insertedIndex]] = id;
      });
      return { positionRulesSetKeywordIds: resultIds };
    });
  }

  /**
   * Every keyword recorded for this position, across every rules set, ordered
   * by rules-set name then keyword name so the list is stable across calls.
   * The join reaches the position through `position_rules_sets`, which is the
   * only place the position id is stored.
   */
  listByPosition(positionId: number): Promise<PositionKeyword[]> {
    return this.db
      .select({
        rulesSetId: rulesSets.id,
        rulesSetName: rulesSets.name,
        keywordId: keywords.id,
        keywordName: keywords.name,
        kind: keywords.kind,
      })
      .from(positionRulesSetKeywords)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetKeywords.positionRulesSetId),
      )
      .innerJoin(rulesSets, eq(rulesSets.id, positionRulesSets.rulesSetId))
      .innerJoin(keywords, eq(keywords.id, positionRulesSetKeywords.keywordId))
      .where(eq(positionRulesSets.positionId, positionId))
      .orderBy(asc(rulesSets.name), asc(keywords.name));
  }
}
