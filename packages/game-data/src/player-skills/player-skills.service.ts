import type {
  PlayerSkillSource,
  SyncPlayerSkills,
  SyncPlayerSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewPlayerSkill } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  inArray,
  players,
  playerSkills,
  skills,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { SkillValidationError } from '../shared/skill-validation-error';

/**
 * One skill a player has, named for display. Not called `PlayerSkill`:
 * `@blood-bowl-tracker/db` already exports that name for the raw table row,
 * and a consumer importing both would collide.
 */
export interface PlayerSkillRow {
  skillId: number;
  skillName: string;
  source: PlayerSkillSource;
  attributeValue: string | null;
  advancementOrder: number | null;
}

/**
 * One entry with its identity fields normalised. `attributeValue` is part of
 * the row's natural key, so an omitted value collapses to `null` immediately
 * — unlike `advancementOrder`, which stays `undefined` when the entry said
 * nothing, the overlay convention every upsert-style write here follows.
 */
interface ResolvedPlayerSkill {
  playerId: number;
  skillId: number;
  source: PlayerSkillSource;
  attributeValue: string | null;
  advancementOrder: number | null | undefined;
}

/** The mutable half of a row, once its natural key has matched. */
interface PlayerSkillUpdate {
  id: number;
  values: { source?: PlayerSkillSource; advancementOrder?: number | null };
}

/** The natural key a row is matched on: player, skill and variant. */
function naturalKey(
  playerId: number,
  skillId: number,
  attributeValue: string | null,
): string {
  return JSON.stringify([playerId, skillId, attributeValue]);
}

/**
 * Owns every skill a player has — starting skills included — and how they
 * came by each one.
 *
 * Deliberately permissive about categories: a `chosen`/`random` entry is not
 * checked against the skill's `skill_rules_sets` category, so a `trait` or
 * `unique` skill recorded as gained is accepted. Imported data is trusted as
 * the external source's own record, because house rules and
 * competition-specific quirks can legitimately produce a combination that
 * looks impossible under the base rules. That is the one way this service
 * differs from PositionRulesSetSkillsService, which it otherwise mirrors.
 */
@Injectable()
export class PlayerSkillsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert any supplied player skill that is not already recorded, matched on
   * its natural key `(playerId, skillId, attributeValue)`, and update the
   * mutable fields of one that is. Every validation runs over the whole batch
   * before any write, so one bad entry fails the call rather than
   * half-applying it. Returned ids are index-aligned with `data.entries`.
   */
  async sync(data: SyncPlayerSkills): Promise<SyncPlayerSkillsResult> {
    if (data.entries.length === 0) {
      return { playerSkillIds: [] };
    }

    const playerIds = [...new Set(data.entries.map((e) => e.playerId))];
    const skillIds = [...new Set(data.entries.map((e) => e.skillId))];

    // Over-fetch both preconditions in one query each and match in memory:
    // two queries regardless of how many entries the batch carries.
    const playerRows = await this.db
      .select({ id: players.id })
      .from(players)
      .where(inArray(players.id, playerIds));
    const skillRows = await this.db
      .select({ id: skills.id })
      .from(skills)
      .where(inArray(skills.id, skillIds));

    const knownPlayerIds = new Set(playerRows.map((row) => row.id));
    const knownSkillIds = new Set(skillRows.map((row) => row.id));

    const resolved = this.resolveEntries(data, knownPlayerIds, knownSkillIds);

    const existingRows = await this.db
      .select({
        id: playerSkills.id,
        playerId: playerSkills.playerId,
        skillId: playerSkills.skillId,
        source: playerSkills.source,
        attributeValue: playerSkills.attributeValue,
        advancementOrder: playerSkills.advancementOrder,
      })
      .from(playerSkills)
      .where(inArray(playerSkills.playerId, playerIds));

    const existingByKey = new Map(
      existingRows.map((row) => [
        naturalKey(row.playerId, row.skillId, row.attributeValue),
        row,
      ]),
    );

    // `resultIds` is sized and indexed to `resolved` so the returned ids line
    // up positionally with `data.entries`, regardless of which entries were
    // pre-existing, updated, or newly inserted.
    const resultIds: number[] = new Array<number>(resolved.length);
    const toInsert: NewPlayerSkill[] = [];
    const toInsertIndexes: number[] = [];
    const toUpdate: PlayerSkillUpdate[] = [];
    for (const [index, row] of resolved.entries()) {
      const existing = existingByKey.get(
        naturalKey(row.playerId, row.skillId, row.attributeValue),
      );
      if (existing === undefined) {
        toInsert.push({
          playerId: row.playerId,
          skillId: row.skillId,
          source: row.source,
          attributeValue: row.attributeValue,
          // A starting row never carries a sequence, regardless of what the
          // entry says: the schema already rejects a numeric order paired
          // with `starting`, but this stays an explicit, unconditional `null`
          // here rather than relying on that alone.
          advancementOrder:
            row.source === 'starting' ? null : (row.advancementOrder ?? null),
        });
        toInsertIndexes.push(index);
        continue;
      }
      resultIds[index] = existing.id;
      const values: PlayerSkillUpdate['values'] = {};
      if (row.source !== existing.source) {
        values.source = row.source;
      }
      if (row.source === 'starting') {
        // The resolved source is (or is becoming) `starting`, which has no
        // sequence at all — clear any previously-stored order even though
        // the entry itself did not mention `advancementOrder`.
        if (existing.advancementOrder !== null) {
          values.advancementOrder = null;
        }
      } else if (
        row.advancementOrder !== undefined &&
        row.advancementOrder !== existing.advancementOrder
      ) {
        values.advancementOrder = row.advancementOrder;
      }
      if (Object.keys(values).length > 0) {
        toUpdate.push({ id: existing.id, values });
      }
    }

    if (toInsert.length === 0 && toUpdate.length === 0) {
      return { playerSkillIds: resultIds };
    }

    // One transaction around every write: the caller treats this single call
    // as one batch that either wholly succeeds or wholly fails.
    return this.db.transaction(async (tx) => {
      for (const { id, values } of toUpdate) {
        await tx
          .update(playerSkills)
          .set(values)
          .where(eq(playerSkills.id, id));
      }

      if (toInsert.length === 0) {
        return { playerSkillIds: resultIds };
      }

      const inserted = await tx
        .insert(playerSkills)
        .values(toInsert)
        .returning({
          id: playerSkills.id,
          playerId: playerSkills.playerId,
          skillId: playerSkills.skillId,
          attributeValue: playerSkills.attributeValue,
        });
      // Postgres does not guarantee INSERT ... RETURNING preserves the input
      // `values()` order, so the returned rows cannot be zipped back onto
      // `toInsert` by array position — match by natural key instead.
      const insertedIdByKey = new Map(
        inserted.map((row) => [
          naturalKey(row.playerId, row.skillId, row.attributeValue),
          row.id,
        ]),
      );
      toInsert.forEach((row, insertedIndex) => {
        const key = naturalKey(
          row.playerId,
          row.skillId,
          row.attributeValue ?? null,
        );
        const id = insertedIdByKey.get(key);
        if (id === undefined) {
          // Every `toInsert` row was just inserted in this same statement, so
          // its key must be present in `inserted` — this can only mean the
          // insert silently dropped a row.
          throw new Error(
            `Insert into player_skills did not return a row for key ${key}`,
          );
        }
        resultIds[toInsertIndexes[insertedIndex]] = id;
      });
      return { playerSkillIds: resultIds };
    });
  }

  /**
   * Validate every entry against the two precondition sets and reject a batch
   * that names the same natural key twice. Without the duplicate check those
   * two entries would both take the insert path and collide on the table's
   * unique constraint, raising a raw database error instead of this clearer
   * one.
   */
  private resolveEntries(
    data: SyncPlayerSkills,
    knownPlayerIds: ReadonlySet<number>,
    knownSkillIds: ReadonlySet<number>,
  ): ResolvedPlayerSkill[] {
    const resolved: ResolvedPlayerSkill[] = [];
    const seenKeys = new Set<string>();
    for (const entry of data.entries) {
      if (!knownPlayerIds.has(entry.playerId)) {
        throw new SkillValidationError(
          `Player ${entry.playerId} does not exist, so no skill can be recorded for them`,
        );
      }
      if (!knownSkillIds.has(entry.skillId)) {
        throw new SkillValidationError(
          `Skill ${entry.skillId} does not exist, so player ${entry.playerId} cannot have it`,
        );
      }
      const attributeValue = entry.attributeValue ?? null;
      const key = naturalKey(entry.playerId, entry.skillId, attributeValue);
      if (seenKeys.has(key)) {
        throw new SkillValidationError(
          `Player ${entry.playerId} lists skill ${entry.skillId} with the same attribute value more than once in the same batch`,
        );
      }
      seenKeys.add(key);
      resolved.push({
        playerId: entry.playerId,
        skillId: entry.skillId,
        source: entry.source,
        attributeValue,
        advancementOrder: entry.advancementOrder,
      });
    }
    return resolved;
  }

  /**
   * Every skill recorded for this player, joined to `skills` for the name,
   * ordered by source, then advancement order, then skill name so the list is
   * stable across calls.
   */
  listByPlayer(playerId: number): Promise<PlayerSkillRow[]> {
    return this.db
      .select({
        skillId: skills.id,
        skillName: skills.name,
        source: playerSkills.source,
        attributeValue: playerSkills.attributeValue,
        advancementOrder: playerSkills.advancementOrder,
      })
      .from(playerSkills)
      .innerJoin(skills, eq(skills.id, playerSkills.skillId))
      .where(eq(playerSkills.playerId, playerId))
      .orderBy(
        // Sorts by the Postgres enum's declaration order, which relies on
        // `PLAYER_SKILL_SOURCES` (packages/domain-enums/src/skills.ts) being
        // declared as `starting`, `chosen`, `random` — reordering that array
        // would silently change this API's result order.
        asc(playerSkills.source),
        asc(playerSkills.advancementOrder),
        asc(skills.name),
      );
  }
}
