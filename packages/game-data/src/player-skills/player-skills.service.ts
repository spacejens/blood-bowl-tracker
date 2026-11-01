import type {
  PlayerSkillEntry,
  SyncPlayerSkills,
  SyncPlayerSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, DbOrTx } from '@blood-bowl-tracker/db';
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
  PlayerCharacteristic,
  PlayerSkillSource,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { SkillValidationError } from '../shared/skill-validation-error';
import type {
  CharacteristicInsert,
  ExistingRow,
  ResolvedEntries,
  SkillInsert,
} from './player-advancement-sync.types';
import { PlayerAdvancementSyncPlannerService } from './player-advancement-sync-planner.service';

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

/** What a batch's entries are validated and marked against. */
interface SyncFacts {
  knownPlayerIds: ReadonlySet<number>;
  knownSkillIds: ReadonlySet<number>;
  /** Ids of the batch's skills named Hatred. */
  hatredSkillIds: ReadonlySet<number>;
  /** Player id -> skills one of that player's own trophy awards grants. */
  grantedSkillIdsByPlayer: ReadonlyMap<number, ReadonlySet<number>>;
  /** The players whose characteristic increases the batch states in full. */
  characteristicPlayerIds: ReadonlySet<number>;
}

/**
 * Owns every advancement row a player has — starting skills, gained skills
 * and characteristic increases — and how they came by each one.
 *
 * Skill rows are matched on their natural key. Characteristic rows have none
 * (a player can raise one characteristic more than once), so each listed
 * player's increases are reconciled as a whole through
 * CharacteristicAdvancementPlannerService, via
 * PlayerAdvancementSyncPlannerService.
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
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly syncPlanner: PlayerAdvancementSyncPlannerService,
  ) {}

  /**
   * Insert any supplied player skill that is not already recorded, matched on
   * its natural key `(playerId, skillId, attributeValue)`, and update the
   * mutable fields of one that is. For every player in
   * `characteristicPlayerIds`, reconcile their stored characteristic-increase
   * rows to the batch's increases through
   * CharacteristicAdvancementPlannerService: rows are kept, revived, inserted
   * or flagged removed, never deleted. A player not listed keeps their
   * increase rows untouched.
   *
   * Skills and increases alike keep a recorded order: an unconfirmed order
   * never overwrites a confirmed one. Every validation runs over the whole
   * batch before any write, so one bad entry fails the call rather than
   * half-applying it. Returned ids are index-aligned with `data.entries`.
   * A skill row is stored as a free extra by the rules in `isFreeExtra`; an
   * existing row is only ever marked, never unmarked.
   */
  async sync(data: SyncPlayerSkills): Promise<SyncPlayerSkillsResult> {
    const characteristicPlayerIds = new Set(data.characteristicPlayerIds ?? []);
    if (data.entries.length === 0 && characteristicPlayerIds.size === 0) {
      return { playerSkillIds: [] };
    }

    const playerIds = [
      ...new Set([
        ...data.entries.map((e) => e.playerId),
        ...characteristicPlayerIds,
      ]),
    ];
    const skillIds = [
      ...new Set(
        data.entries.flatMap((e) =>
          e.skillId === undefined ? [] : [e.skillId],
        ),
      ),
    ];

    // Over-fetch both preconditions in one query each and match in memory:
    // two queries regardless of how many entries the batch carries. The
    // player query also brings each player's skill-granting trophy awards, so
    // a player with several awards comes back once per award. A batch naming
    // no skill skips the skills query.
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
    const skillRows =
      skillIds.length === 0
        ? []
        : await this.db
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
      characteristicPlayerIds,
    });

    const existingRows: ExistingRow[] = await this.db
      .select({
        id: playerAdvancements.id,
        playerId: playerAdvancements.playerId,
        skillId: playerAdvancements.skillId,
        characteristic: playerAdvancements.characteristic,
        source: playerAdvancements.source,
        attributeValue: playerAdvancements.attributeValue,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
        isFreeExtra: playerAdvancements.isFreeExtra,
        removed: playerAdvancements.removed,
      })
      .from(playerAdvancements)
      .where(inArray(playerAdvancements.playerId, playerIds));

    // `resultIds` is sized and indexed to `data.entries` so the returned ids
    // line up positionally with it, regardless of which entries were
    // pre-existing, updated, or newly inserted.
    const resultIds: number[] = new Array<number>(data.entries.length);
    const skillWrites = this.syncPlanner.planSkills(
      resolved.skills,
      existingRows,
      resultIds,
    );
    const characteristicWrites = this.syncPlanner.planCharacteristics(
      {
        characteristics: resolved.characteristics,
        playerIds: characteristicPlayerIds,
        entries: data.entries,
      },
      existingRows,
      resultIds,
    );
    const changedPlayerIds = new Set([
      ...skillWrites.changedPlayerIds,
      ...characteristicWrites.changedPlayerIds,
    ]);

    if (changedPlayerIds.size === 0) {
      return { playerSkillIds: resultIds };
    }

    // One transaction around every write: the caller treats this single call
    // as one batch that either wholly succeeds or wholly fails.
    return this.db.transaction(async (tx) => {
      for (const { id, values } of skillWrites.updates) {
        await tx
          .update(playerAdvancements)
          .set(values)
          .where(eq(playerAdvancements.id, id));
      }
      await this.insertSkills(tx, skillWrites.inserts, resultIds);
      // Each update sets a row's order, confirmation and removal together, so
      // no per-row check is ever violated in between. No index is unique on
      // a player's order, so orders swapping between rows is safe too.
      for (const { id, values } of characteristicWrites.updates) {
        await tx
          .update(playerAdvancements)
          .set(values)
          .where(eq(playerAdvancements.id, id));
      }
      await this.insertCharacteristics(
        tx,
        characteristicWrites.inserts,
        resultIds,
      );

      // A changed advancement can change what the player's advancements
      // cost, so the stored unspent SPP is cleared until the import's SPP
      // adjustment sync writes it again. Rows already cleared are left alone.
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

  /** Insert the new skill rows and record their ids in `resultIds`. */
  private async insertSkills(
    tx: DbOrTx,
    toInsert: SkillInsert[],
    resultIds: number[],
  ): Promise<void> {
    if (toInsert.length === 0) {
      return;
    }
    const inserted = await tx
      .insert(playerAdvancements)
      .values(toInsert.map((row) => row.values))
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
        this.syncPlanner.naturalKey(
          row.playerId,
          row.skillId,
          row.attributeValue,
        ),
        row.id,
      ]),
    );
    for (const { index, values } of toInsert) {
      const key = this.syncPlanner.naturalKey(
        values.playerId,
        values.skillId ?? null,
        values.attributeValue ?? null,
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
      resultIds[index] = id;
    }
  }

  /** Insert the new characteristic rows and record their ids in `resultIds`. */
  private async insertCharacteristics(
    tx: DbOrTx,
    toInsert: CharacteristicInsert[],
    resultIds: number[],
  ): Promise<void> {
    if (toInsert.length === 0) {
      return;
    }
    const inserted = await tx
      .insert(playerAdvancements)
      .values(
        toInsert.map((row) => ({
          playerId: row.playerId,
          source: 'characteristic' as const,
          characteristic: row.characteristic,
          advancementOrder: row.advancementOrder,
          ...(row.orderConfirmed ? { orderConfirmed: true } : {}),
        })),
      )
      .returning({
        id: playerAdvancements.id,
        playerId: playerAdvancements.playerId,
        characteristic: playerAdvancements.characteristic,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
      });
    // Identical increases are interchangeable, so ids are handed out per key
    // in whatever order Postgres returned them.
    const idsByKey = new Map<string, number[]>();
    for (const row of inserted) {
      const key = this.characteristicKey(row);
      idsByKey.set(key, [...(idsByKey.get(key) ?? []), row.id]);
    }
    for (const row of toInsert) {
      const key = this.characteristicKey(row);
      const id = idsByKey.get(key)?.shift();
      if (id === undefined) {
        throw new Error(
          `Insert into player_advancements did not return a row for characteristic key ${key}`,
        );
      }
      resultIds[row.index] = id;
    }
  }

  /**
   * The key identical characteristic rows share: interchangeable rows get the
   * same one.
   */
  private characteristicKey(row: {
    playerId: number;
    characteristic: PlayerCharacteristic | null;
    advancementOrder: number | null;
    orderConfirmed: boolean;
  }): string {
    return JSON.stringify([
      row.playerId,
      row.characteristic,
      row.advancementOrder,
      row.orderConfirmed,
    ]);
  }

  /**
   * Validate every entry against the precondition sets, split the batch into
   * skills and characteristic increases, and reject a batch that names the
   * same skill natural key twice. Without the duplicate check those two
   * entries would both take the insert path and collide on the table's
   * unique index, raising a raw database error instead of this clearer one.
   */
  private resolveEntries(
    data: SyncPlayerSkills,
    facts: SyncFacts,
  ): ResolvedEntries {
    for (const id of facts.characteristicPlayerIds) {
      if (!facts.knownPlayerIds.has(id)) {
        throw new SkillValidationError(
          `Player ${id} does not exist, so no characteristic increase can be recorded for them`,
        );
      }
    }
    const resolved: ResolvedEntries = { skills: [], characteristics: [] };
    const seenKeys = new Set<string>();
    for (const [index, entry] of data.entries.entries()) {
      if (!facts.knownPlayerIds.has(entry.playerId)) {
        throw new SkillValidationError(
          `Player ${entry.playerId} does not exist, so no skill can be recorded for them`,
        );
      }
      if (
        entry.source === 'characteristic' &&
        entry.characteristic !== undefined
      ) {
        if (!facts.characteristicPlayerIds.has(entry.playerId)) {
          throw new SkillValidationError(
            `Player ${entry.playerId} has characteristic increases in the batch but is not listed in characteristicPlayerIds`,
          );
        }
        resolved.characteristics.push({
          index,
          playerId: entry.playerId,
          characteristic: entry.characteristic,
          advancementOrder: entry.advancementOrder,
          orderConfirmed: entry.orderConfirmed === true,
        });
        continue;
      }
      const skillId = entry.skillId;
      if (skillId === undefined) {
        throw new SkillValidationError(
          `An entry of player ${entry.playerId} names no skill`,
        );
      }
      if (!facts.knownSkillIds.has(skillId)) {
        throw new SkillValidationError(
          `Skill ${skillId} does not exist, so player ${entry.playerId} cannot have it`,
        );
      }
      const attributeValue = entry.attributeValue ?? null;
      const key = this.syncPlanner.naturalKey(
        entry.playerId,
        skillId,
        attributeValue,
      );
      if (seenKeys.has(key)) {
        throw new SkillValidationError(
          `Player ${entry.playerId} lists skill ${skillId} with the same attribute value more than once in the same batch`,
        );
      }
      seenKeys.add(key);
      resolved.skills.push({
        index,
        playerId: entry.playerId,
        skillId,
        source: entry.source,
        attributeValue,
        advancementOrder: entry.advancementOrder,
        orderConfirmed: entry.orderConfirmed === true,
        isFreeExtra: this.isFreeExtra(entry, skillId, facts),
      });
    }
    return resolved;
  }

  /**
   * Whether a skill entry is stored as a free extra: the source flags it, it
   * is a non-`starting` Hatred, or (for any other skill) one of the player's
   * own trophy awards grants it. The trophy rule never applies to Hatred.
   */
  private isFreeExtra(
    entry: PlayerSkillEntry,
    skillId: number,
    facts: SyncFacts,
  ): boolean {
    if (entry.isFreeExtra === true) {
      return true;
    }
    if (facts.hatredSkillIds.has(skillId)) {
      return entry.source !== 'starting';
    }
    return (
      facts.grantedSkillIdsByPlayer.get(entry.playerId)?.has(skillId) === true
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
