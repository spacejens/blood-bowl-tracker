import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  and,
  asc,
  DB,
  eq,
  eraRulesSets,
  eras,
  inArray,
  isNotNull,
  players,
  playerSkills,
  positionRulesSets,
  positionRulesSetSkillCategories,
  positions,
  rulesSets,
  skillRulesSets,
  skills,
  teamEras,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import type { SkillCategory } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import type {
  AdvancementHistory,
  ApplicableCost,
  StoredPlayerSkill,
} from './advancement-cost-model.types';

/** Ids per `inArray`, well inside Postgres's bind-parameter limit. */
const CHUNK_SIZE = 1000;

interface StoredCost extends ApplicableCost {
  rulesSetId: number;
}

interface RulesSetRef {
  id: number;
  name: string;
}

/** What one chunk's assembly needs besides its own ids. */
interface ChunkContext {
  rulesSetsByEra: Map<number, RulesSetRef>;
  costs: StoredCost[];
  result: Map<number, AdvancementHistory>;
}

/** A stored skill before its category under the player's rules set is known. */
type UncategorisedSkill = Omit<StoredPlayerSkill, 'category'>;

/** One position's primary and secondary categories under one rules set. */
interface PositionCategories {
  primary: Set<SkillCategory>;
  secondary: Set<SkillCategory>;
}

/** The per-chunk lookups, keyed by `pairKey`. */
interface CategoryLookups {
  /** By position id and rules set id. */
  positions: Map<string, PositionCategories>;
  /** By skill id and rules set id. */
  skills: Map<string, SkillCategory>;
}

/**
 * Loads what the advancement-cost check needs about a batch of players,
 * straight from `packages/db`: total SPP, star status, the era's last-listed
 * rules set (`era_rules_sets`, highest id — the same insertion-order
 * heuristic the other panels use), the stored skills, the skills one of the
 * player's own trophy awards granted, the five increase counts, and the
 * `advancement_costs` rows that apply (the rules set's own plus the player's
 * league's house rules: player -> team era -> era -> league), plus the
 * categories the player's position has as primary and as secondary under
 * that rules set (`position_rules_set_skill_categories`, ignoring removed
 * rows) and each stored skill's category under it (`skill_rules_sets`).
 *
 * The era -> rules-set map and the cost table are small and loaded once per
 * process. Players are loaded in chunks, because the unspent-SPP stratum asks
 * for every player of a source at once.
 *
 * Skills come back starting first, then gained in stored order
 * (`advancement_order`, then name). Postgres sorts NULL last, and a starting
 * row always has a NULL order, so the starting rows are moved to the front
 * here.
 */
@Injectable()
export class PlayerAdvancementHistoryService {
  private rulesSetsByEra: Promise<Map<number, RulesSetRef>> | undefined;
  private costs: Promise<StoredCost[]> | undefined;

  constructor(@Inject(DB) private readonly db: Db) {}

  async forPlayers(
    playerIds: readonly number[],
  ): Promise<Map<number, AdvancementHistory>> {
    const result = new Map<number, AdvancementHistory>();
    const ids = [...new Set(playerIds)];
    if (ids.length === 0) {
      return result;
    }
    this.rulesSetsByEra ??= this.loadRulesSetsByEra();
    this.costs ??= this.loadCosts();
    const context: ChunkContext = {
      rulesSetsByEra: await this.rulesSetsByEra,
      costs: await this.costs,
      result,
    };
    for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
      await this.loadChunk(ids.slice(start, start + CHUNK_SIZE), context);
    }
    return result;
  }

  private async loadChunk(ids: number[], context: ChunkContext): Promise<void> {
    const playerRows = await this.db
      .select({
        playerId: players.id,
        sppTotal: players.sppTotal,
        unspentSpp: players.unspentSpp,
        isStarPlayer: positions.isStarPlayer,
        eraId: teamEras.eraId,
        leagueId: eras.leagueId,
        positionId: players.positionId,
        move: players.moveIncreaseCount,
        strength: players.strengthIncreaseCount,
        agility: players.agilityIncreaseCount,
        passing: players.passingIncreaseCount,
        armour: players.armourIncreaseCount,
      })
      .from(players)
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(inArray(players.id, ids));
    if (playerRows.length === 0) {
      return;
    }
    const skillsByPlayer = await this.loadSkills(ids);
    const trophySkillsByPlayer = await this.loadTrophySkills(ids);
    const lookups: CategoryLookups = {
      positions: await this.loadPositionCategories([
        ...new Set(playerRows.map((row) => row.positionId)),
      ]),
      skills: await this.loadSkillCategories([
        ...new Set(
          [...skillsByPlayer.values()].flat().map((skill) => skill.skillId),
        ),
      ]),
    };
    for (const row of playerRows) {
      const rulesSet = context.rulesSetsByEra.get(row.eraId) ?? null;
      const positionCategories =
        rulesSet === null
          ? undefined
          : lookups.positions.get(this.pairKey(row.positionId, rulesSet.id));
      context.result.set(row.playerId, {
        playerId: row.playerId,
        sppTotal: row.sppTotal,
        storedUnspentSpp: row.unspentSpp,
        isStarPlayer: row.isStarPlayer,
        rulesSet,
        skills: (skillsByPlayer.get(row.playerId) ?? []).map((skill) => ({
          ...skill,
          category:
            rulesSet === null
              ? null
              : (lookups.skills.get(this.pairKey(skill.skillId, rulesSet.id)) ??
                null),
        })),
        primaryCategories: positionCategories?.primary ?? new Set(),
        secondaryCategories: positionCategories?.secondary ?? new Set(),
        trophyGrantedSkillIds:
          trophySkillsByPlayer.get(row.playerId) ?? new Set<number>(),
        increaseCounts: {
          move: row.move,
          strength: row.strength,
          agility: row.agility,
          passing: row.passing,
          armour: row.armour,
        },
        costs:
          rulesSet === null
            ? []
            : context.costs
                .filter(
                  (cost) =>
                    cost.rulesSetId === rulesSet.id &&
                    (cost.leagueId === null || cost.leagueId === row.leagueId),
                )
                .map((cost) => ({
                  advancementNumber: cost.advancementNumber,
                  advancementKind: cost.advancementKind,
                  skillId: cost.skillId,
                  sppCost: cost.sppCost,
                  leagueId: cost.leagueId,
                })),
      });
    }
  }

  private async loadSkills(
    ids: number[],
  ): Promise<Map<number, UncategorisedSkill[]>> {
    const rows = await this.db
      .select({
        playerId: playerSkills.playerId,
        skillId: playerSkills.skillId,
        skillName: skills.name,
        source: playerSkills.source,
        advancementOrder: playerSkills.advancementOrder,
      })
      .from(playerSkills)
      .innerJoin(skills, eq(skills.id, playerSkills.skillId))
      .where(inArray(playerSkills.playerId, ids))
      .orderBy(
        asc(playerSkills.playerId),
        asc(playerSkills.advancementOrder),
        asc(skills.name),
      );
    const byPlayer = new Map<number, UncategorisedSkill[]>();
    for (const { playerId, ...skill } of rows) {
      const list = byPlayer.get(playerId) ?? [];
      list.push(skill);
      byPlayer.set(playerId, list);
    }
    for (const [playerId, list] of byPlayer) {
      byPlayer.set(playerId, [
        ...list.filter((skill) => skill.source === 'starting'),
        ...list.filter((skill) => skill.source !== 'starting'),
      ]);
    }
    return byPlayer;
  }

  private async loadTrophySkills(
    ids: number[],
  ): Promise<Map<number, Set<number>>> {
    const rows = await this.db
      .select({
        playerId: trophyAwards.playerId,
        skillId: trophyAwards.grantedSkillId,
      })
      .from(trophyAwards)
      .where(
        and(
          inArray(trophyAwards.playerId, ids),
          isNotNull(trophyAwards.grantedSkillId),
        ),
      );
    const byPlayer = new Map<number, Set<number>>();
    for (const { playerId, skillId } of rows) {
      // Both columns are nullable in the schema; the filter keeps only rows
      // with both set, but the types do not know that.
      if (playerId === null || skillId === null) {
        continue;
      }
      const granted = byPlayer.get(playerId) ?? new Set<number>();
      granted.add(skillId);
      byPlayer.set(playerId, granted);
    }
    return byPlayer;
  }

  private async loadPositionCategories(
    positionIds: number[],
  ): Promise<Map<string, PositionCategories>> {
    const rows = await this.db
      .select({
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
        category: positionRulesSetSkillCategories.skillCategory,
        access: positionRulesSetSkillCategories.access,
      })
      .from(positionRulesSetSkillCategories)
      .innerJoin(
        positionRulesSets,
        eq(
          positionRulesSets.id,
          positionRulesSetSkillCategories.positionRulesSetId,
        ),
      )
      .where(
        and(
          inArray(positionRulesSets.positionId, positionIds),
          eq(positionRulesSetSkillCategories.removed, false),
        ),
      );
    const byPair = new Map<string, PositionCategories>();
    for (const { positionId, rulesSetId, category, access } of rows) {
      const key = this.pairKey(positionId, rulesSetId);
      const categories = byPair.get(key) ?? {
        primary: new Set<SkillCategory>(),
        secondary: new Set<SkillCategory>(),
      };
      categories[access].add(category);
      byPair.set(key, categories);
    }
    return byPair;
  }

  /** No query when the chunk's players have no skills at all. */
  private async loadSkillCategories(
    skillIds: number[],
  ): Promise<Map<string, SkillCategory>> {
    if (skillIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        skillId: skillRulesSets.skillId,
        rulesSetId: skillRulesSets.rulesSetId,
        category: skillRulesSets.category,
      })
      .from(skillRulesSets)
      .where(inArray(skillRulesSets.skillId, skillIds));
    return new Map(
      rows.map((row) => [
        this.pairKey(row.skillId, row.rulesSetId),
        row.category,
      ]),
    );
  }

  /** One lookup key for an id paired with a rules set id. */
  private pairKey(id: number, rulesSetId: number): string {
    return `${String(id)}:${String(rulesSetId)}`;
  }

  /** Later rows overwrite earlier ones, so each era keeps its highest id. */
  private async loadRulesSetsByEra(): Promise<Map<number, RulesSetRef>> {
    const rows = await this.db
      .select({
        eraId: eraRulesSets.eraId,
        id: rulesSets.id,
        name: rulesSets.name,
      })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .orderBy(asc(eraRulesSets.id));
    return new Map(
      rows.map((row) => [row.eraId, { id: row.id, name: row.name }]),
    );
  }

  private async loadCosts(): Promise<StoredCost[]> {
    return await this.db
      .select({
        rulesSetId: advancementCosts.rulesSetId,
        leagueId: advancementCosts.leagueId,
        advancementNumber: advancementCosts.advancementNumber,
        advancementKind: advancementCosts.advancementKind,
        skillId: advancementCosts.skillId,
        sppCost: advancementCosts.sppCost,
      })
      .from(advancementCosts);
  }
}
