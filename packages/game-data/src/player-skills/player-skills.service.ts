import type {
  PlayerSkillEntry,
  SyncPlayerSkills,
  SyncPlayerSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewPlayerAdvancement } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  eq,
  inArray,
  isNotNull,
  playerAdvancements,
  players,
  skillRulesSets,
  skills,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import type {
  PlayerSkillSource,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { SkillValidationError } from '../shared/skill-validation-error';

/**
 * The curated name of the one skill gained only as a free extra: BB2025
 * grants Hatred on top of a player's advancements, never as one. The skill
 * name alone is Hatred's identity: its variants live in `attribute_value`.
 */
const HATRED_SKILL_NAME = 'Hatred';

/**
 * One skill a player has, named for display. Not called `PlayerAdvancement`:
 * `@blood-bowl-tracker/db` already exports that name for the raw table row,
 * and a consumer importing both would collide.
 */
export interface PlayerSkillRow {
  skillId: number;
  skillName: string;
  source: PlayerSkillSource;
  attributeValue: string | null;
  advancementOrder: number | null;
  /**
   * The skill's category under the rules set the caller asked about, or null
   * when no `skill_rules_sets` row curates it there. Unlike a position's
   * starting skills, a player's skills are not validated against that table,
   * so the absence is a normal state rather than a data error.
   */
  category: SkillCategory | null;
  /**
   * Whether the skill is elite under the rules set the caller asked about.
   * False both when the rules set says it is not and when the rules set has no
   * such concept at all (everything before BB2025) — the same conflation the
   * column's own `NOT NULL DEFAULT false` makes.
   */
  isElite: boolean;
  /**
   * Whether the stored row is a free extra: gained without spending SPP and
   * not one of the player's advancements, so a cost model prices it at 0 and
   * leaves it out of the advancement count.
   */
  isFreeExtra: boolean;
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
  isFreeExtra: boolean;
}

/** The mutable half of a row, once its natural key has matched. */
interface PlayerSkillUpdate {
  id: number;
  values: {
    source?: PlayerSkillSource;
    advancementOrder?: number | null;
    isFreeExtra?: true;
  };
}

/** What a batch's entries are validated and marked against. */
interface SyncFacts {
  knownPlayerIds: ReadonlySet<number>;
  knownSkillIds: ReadonlySet<number>;
  /** Ids of the batch's skills named Hatred. */
  hatredSkillIds: ReadonlySet<number>;
  /** Player id -> skills one of that player's own trophy awards grants. */
  grantedSkillIdsByPlayer: ReadonlyMap<number, ReadonlySet<number>>;
}

/** The natural key a row is matched on: player, skill and variant. */
function naturalKey(
  playerId: number,
  skillId: number | null,
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
   * A row is stored as a free extra by the rules in `isFreeExtra`; an
   * existing row is only ever marked, never unmarked.
   */
  async sync(data: SyncPlayerSkills): Promise<SyncPlayerSkillsResult> {
    if (data.entries.length === 0) {
      return { playerSkillIds: [] };
    }

    const playerIds = [...new Set(data.entries.map((e) => e.playerId))];
    const skillIds = [...new Set(data.entries.map((e) => e.skillId))];

    // Over-fetch both preconditions in one query each and match in memory:
    // two queries regardless of how many entries the batch carries. The
    // player query also brings each player's skill-granting trophy awards, so
    // a player with several awards comes back once per award.
    const playerRows = await this.db
      .select({ id: players.id, grantedSkillId: trophyAwards.grantedSkillId })
      .from(players)
      .leftJoin(
        trophyAwards,
        and(
          eq(trophyAwards.playerId, players.id),
          isNotNull(trophyAwards.grantedSkillId),
        ),
      )
      .where(inArray(players.id, playerIds));
    const skillRows = await this.db
      .select({ id: skills.id, name: skills.name })
      .from(skills)
      .where(inArray(skills.id, skillIds));

    const grantedSkillIdsByPlayer = new Map<number, Set<number>>();
    for (const row of playerRows) {
      if (typeof row.grantedSkillId !== 'number') {
        continue;
      }
      const granted = grantedSkillIdsByPlayer.get(row.id) ?? new Set<number>();
      granted.add(row.grantedSkillId);
      grantedSkillIdsByPlayer.set(row.id, granted);
    }
    const resolved = this.resolveEntries(data, {
      knownPlayerIds: new Set(playerRows.map((row) => row.id)),
      knownSkillIds: new Set(skillRows.map((row) => row.id)),
      hatredSkillIds: new Set(
        skillRows
          .filter((row) => row.name === HATRED_SKILL_NAME)
          .map((row) => row.id),
      ),
      grantedSkillIdsByPlayer,
    });

    const existingRows = await this.db
      .select({
        id: playerAdvancements.id,
        playerId: playerAdvancements.playerId,
        skillId: playerAdvancements.skillId,
        source: playerAdvancements.source,
        attributeValue: playerAdvancements.attributeValue,
        advancementOrder: playerAdvancements.advancementOrder,
        isFreeExtra: playerAdvancements.isFreeExtra,
      })
      .from(playerAdvancements)
      .where(inArray(playerAdvancements.playerId, playerIds));

    // Characteristic rows are not skills and are never touched by a skill sync.
    const existingByKey = new Map(
      existingRows
        .filter((row) => row.source !== 'characteristic')
        .map((row) => [
          naturalKey(row.playerId, row.skillId, row.attributeValue),
          row,
        ]),
    );

    // `resultIds` is sized and indexed to `resolved` so the returned ids line
    // up positionally with `data.entries`, regardless of which entries were
    // pre-existing, updated, or newly inserted.
    const resultIds: number[] = new Array<number>(resolved.length);
    const toInsert: NewPlayerAdvancement[] = [];
    const toInsertIndexes: number[] = [];
    const toUpdate: PlayerSkillUpdate[] = [];
    const changedPlayerIds = new Set<number>();
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
          // Only a free row names the column; every other row takes its
          // `false` default.
          ...(row.isFreeExtra ? { isFreeExtra: true } : {}),
        });
        toInsertIndexes.push(index);
        changedPlayerIds.add(row.playerId);
        continue;
      }
      resultIds[index] = existing.id;
      const values: PlayerSkillUpdate['values'] = {};
      if (this.sourceChanges(existing.source, row.source)) {
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
      // Set-only: a row once free stays free, whatever a later entry says.
      if (row.isFreeExtra && !existing.isFreeExtra) {
        values.isFreeExtra = true;
      }
      if (Object.keys(values).length > 0) {
        toUpdate.push({ id: existing.id, values });
        changedPlayerIds.add(existing.playerId);
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
          .update(playerAdvancements)
          .set(values)
          .where(eq(playerAdvancements.id, id));
      }

      if (toInsert.length > 0) {
        const inserted = await tx
          .insert(playerAdvancements)
          .values(toInsert)
          .returning({
            id: playerAdvancements.id,
            playerId: playerAdvancements.playerId,
            skillId: playerAdvancements.skillId,
            attributeValue: playerAdvancements.attributeValue,
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
            row.skillId ?? null,
            row.attributeValue ?? null,
          );
          const id = insertedIdByKey.get(key);
          if (id === undefined) {
            // Every `toInsert` row was just inserted in this same statement, so
            // its key must be present in `inserted` — this can only mean the
            // insert silently dropped a row.
            throw new Error(
              `Insert into player_advancements did not return a row for key ${key}`,
            );
          }
          resultIds[toInsertIndexes[insertedIndex]] = id;
        });
      }

      // A changed skill can change what the player's advancements cost, so
      // the stored unspent SPP is cleared until the import's SPP adjustment
      // sync writes it again. Rows already cleared are left alone.
      await tx
        .update(players)
        .set({ unspentSpp: null })
        .where(
          and(
            inArray(players.id, [...changedPlayerIds]),
            isNotNull(players.unspentSpp),
          ),
        );
      return { playerSkillIds: resultIds };
    });
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
   * Validate every entry against the two precondition sets and reject a batch
   * that names the same natural key twice. Without the duplicate check those
   * two entries would both take the insert path and collide on the table's
   * unique constraint, raising a raw database error instead of this clearer
   * one.
   */
  private resolveEntries(
    data: SyncPlayerSkills,
    facts: SyncFacts,
  ): ResolvedPlayerSkill[] {
    const resolved: ResolvedPlayerSkill[] = [];
    const seenKeys = new Set<string>();
    for (const entry of data.entries) {
      if (!facts.knownPlayerIds.has(entry.playerId)) {
        throw new SkillValidationError(
          `Player ${entry.playerId} does not exist, so no skill can be recorded for them`,
        );
      }
      if (!facts.knownSkillIds.has(entry.skillId)) {
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
        isFreeExtra: this.isFreeExtra(entry, facts),
      });
    }
    return resolved;
  }

  /**
   * Whether an entry is stored as a free extra: the source flags it, it is a
   * non-`starting` Hatred, or (for any other skill) one of the player's own
   * trophy awards grants it. The trophy rule never applies to Hatred.
   */
  private isFreeExtra(entry: PlayerSkillEntry, facts: SyncFacts): boolean {
    if (entry.isFreeExtra === true) {
      return true;
    }
    if (facts.hatredSkillIds.has(entry.skillId)) {
      return entry.source !== 'starting';
    }
    return (
      facts.grantedSkillIdsByPlayer.get(entry.playerId)?.has(entry.skillId) ===
      true
    );
  }

  /**
   * Mark the player's rows of a skill one of their own trophy awards grants
   * as free extras. Covers an award recorded after the skill; `sync` covers
   * the opposite order. Never applied to Hatred, matching `sync`'s trophy
   * rule. Clears nothing: `unmarkTrophyGranted` is the counterpart, and the
   * caller re-prices the player's stored unspent SPP afterwards.
   */
  async markTrophyGranted(playerId: number, skillId: number): Promise<void> {
    const [skill] = await this.db
      .select({ name: skills.name })
      .from(skills)
      .where(eq(skills.id, skillId));
    if (skill === undefined || skill.name === HATRED_SKILL_NAME) {
      return;
    }
    await this.db
      .update(playerAdvancements)
      .set({ isFreeExtra: true })
      .where(
        and(
          eq(playerAdvancements.playerId, playerId),
          eq(playerAdvancements.skillId, skillId),
          eq(playerAdvancements.isFreeExtra, false),
        ),
      );
  }

  /**
   * Unmark the player's rows of a skill a trophy award used to grant, after
   * that award's granted skill changed or was cleared. Skips Hatred (free by
   * its own rule) and a skill another of the player's awards still grants;
   * the caller has already stored the change, so the changed award no longer
   * counts. A row TP also flagged as an extra is unmarked too: the next TP
   * import marks it again. The caller re-prices the player's stored unspent
   * SPP afterwards.
   */
  async unmarkTrophyGranted(playerId: number, skillId: number): Promise<void> {
    const [skill] = await this.db
      .select({ name: skills.name })
      .from(skills)
      .where(eq(skills.id, skillId));
    if (skill === undefined || skill.name === HATRED_SKILL_NAME) {
      return;
    }
    const [stillGranted] = await this.db
      .select({ id: trophyAwards.id })
      .from(trophyAwards)
      .where(
        and(
          eq(trophyAwards.playerId, playerId),
          eq(trophyAwards.grantedSkillId, skillId),
        ),
      )
      .limit(1);
    if (stillGranted !== undefined) {
      return;
    }
    await this.db
      .update(playerAdvancements)
      .set({ isFreeExtra: false })
      .where(
        and(
          eq(playerAdvancements.playerId, playerId),
          eq(playerAdvancements.skillId, skillId),
          eq(playerAdvancements.isFreeExtra, true),
        ),
      );
  }

  /**
   * Every skill recorded for this player, joined to `skills` for the name and
   * to `skill_rules_sets` for how `rulesSetId` categorises it, ordered by
   * source, then advancement order, then skill name so the list is stable
   * across calls.
   *
   * The `skill_rules_sets` join is a left join, unlike the equivalent join in
   * PositionRulesSetSkillsService: `sync` above deliberately accepts a player
   * skill with no curated row for the rules set, so a missed join is a normal
   * state to report rather than a reason to drop the skill from the list.
   * Each row carries the stored free-extra flag.
   */
  async listByPlayer(
    playerId: number,
    rulesSetId: number,
  ): Promise<PlayerSkillRow[]> {
    const rows = await this.db
      .select({
        skillId: skills.id,
        skillName: skills.name,
        source: playerAdvancements.source,
        attributeValue: playerAdvancements.attributeValue,
        advancementOrder: playerAdvancements.advancementOrder,
        category: skillRulesSets.category,
        isElite: skillRulesSets.isElite,
        isFreeExtra: playerAdvancements.isFreeExtra,
      })
      .from(playerAdvancements)
      .innerJoin(skills, eq(skills.id, playerAdvancements.skillId))
      .leftJoin(
        skillRulesSets,
        and(
          eq(skillRulesSets.skillId, playerAdvancements.skillId),
          eq(skillRulesSets.rulesSetId, rulesSetId),
        ),
      )
      .where(eq(playerAdvancements.playerId, playerId))
      .orderBy(
        // Sorts by the Postgres enum's declaration order, which relies on
        // `PLAYER_SKILL_SOURCES` (packages/domain-enums/src/skills.ts) being
        // declared as `starting`, `advancement`, `chosen`, `random` —
        // reordering that array would silently change this API's result
        // order, and so would a migration that appends a new enum value
        // rather than inserting it at its declared position.
        asc(playerAdvancements.source),
        asc(playerAdvancements.advancementOrder),
        asc(skills.name),
      );
    // A missed left join yields a null `isElite`; collapse it to the column's
    // own default so every consumer sees one plain boolean.
    return rows.map((row) => ({ ...row, isElite: row.isElite ?? false }));
  }
}
