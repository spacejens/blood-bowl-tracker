import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  and,
  DB,
  eq,
  eraRulesSets,
  eras,
  inArray,
  isNotNull,
  isNull,
  or,
  players,
  playerSkills,
  positionRulesSets,
  positionRulesSetSkillCategories,
  positions,
  skillRulesSets,
  teamEras,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import type {
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import type {
  ApplicableAdvancementCost,
  CoversAnother,
  PlayerSkillEntry,
  UnspentSppResult,
  UnspentSppUnknownReason,
} from './unspent-spp.types';

/** One player, with what decides which rules sets and costs apply to them. */
interface PlayerFacts {
  playerId: number;
  sppTotal: number | null;
  positionId: number;
  isStarPlayer: boolean;
  eraId: number;
  leagueId: number;
  characteristicIncreases: number;
}

/** A player whose total SPP is known, so their spend can be priced. */
interface PricedPlayer extends PlayerFacts {
  sppTotal: number;
}

/** A cost row with the rules set and league it belongs to. */
interface StoredCost extends ApplicableAdvancementCost {
  rulesSetId: number;
  leagueId: number | null;
}

/** Everything loaded for a batch of players, indexed for per-player lookup. */
interface UnspentSppData {
  rulesSetIdsByEra: Map<number, number[]>;
  skillsByPlayer: Map<number, PlayerSkillEntry[]>;
  trophySkillsByPlayer: Map<number, Set<number>>;
  /** Rules set id -> skill id -> the skill's category under that rules set. */
  categoriesByRulesSet: Map<number, Map<number, SkillCategory>>;
  /** `positionId|rulesSetId` -> category -> the position's access to it. */
  accessByPositionRulesSet: Map<string, Map<SkillCategory, SkillAccess>>;
  costs: StoredCost[];
}

/** What one rules set's costs make of a player's history, when they fit. */
interface FittingOutcome {
  kind: 'fits';
  advancementsGained: number;
  spentMin: number;
  spentMax: number;
  cheapestNextCost: number | null;
  coversAnother: CoversAnother;
}

type RulesSetOutcome =
  { kind: 'no_costs' } | { kind: 'inconsistent' } | FittingOutcome;

/**
 * How much of a player's SPP is unspent, and whether it covers at least the
 * cheapest advancement they could take next.
 *
 * Spent SPP is what the player's gained advancements cost under
 * `advancement_costs`. Under type-priced rules sets the history does not
 * always say which kind each advancement was or in which order they came, so
 * the answer is a range: AdvancementKindCandidatesService lists what each
 * advancement could have been and AdvancementSpendRangeService prices every
 * fitting order. An era can list several rules sets; each is tried, the
 * widest range is kept, and one whose costs the history cannot fit is
 * ignored. The verdict is `yes` or `no` only when every fitting rules set
 * agrees on it.
 *
 * Holding unspent SPP is a normal state, so this is information only. Player
 * status is not consulted: dead, retired and departed players are worked out
 * like any other. Advancements missing from the recorded history understate
 * the spend, so a `no` verdict is reliable while a `yes` can be generous.
 */
@Injectable()
export class UnspentSppService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly candidates: AdvancementKindCandidatesService,
    private readonly spendRange: AdvancementSpendRangeService,
  ) {}

  /** One player's result, or undefined when no such player exists. */
  async forPlayer(playerId: number): Promise<UnspentSppResult | undefined> {
    return (await this.forPlayers([playerId])).get(playerId);
  }

  /**
   * Each requested player's result, keyed by player id. A requested id with
   * no player is absent. The whole batch is loaded in one query per table.
   *
   * Meant for one player or one roster at a time: the player ids go into a
   * single unchunked `inArray`, so a very large batch could exceed Postgres's
   * bind-parameter limit.
   */
  async forPlayers(
    playerIds: number[],
  ): Promise<Map<number, UnspentSppResult>> {
    const results = new Map<number, UnspentSppResult>();
    const ids = this.distinct(playerIds);
    if (ids.length === 0) {
      return results;
    }
    const facts = await this.loadPlayers(ids);
    if (facts.length === 0) {
      return results;
    }
    const data = await this.loadData(facts);
    for (const player of facts) {
      results.set(player.playerId, this.resultFor(player, data));
    }
    return results;
  }

  private resultFor(
    player: PlayerFacts,
    data: UnspentSppData,
  ): UnspentSppResult {
    if (player.isStarPlayer) {
      return this.unknown('star_player');
    }
    if (player.sppTotal === null) {
      return this.unknown('no_total_spp');
    }
    const rulesSetIds = data.rulesSetIdsByEra.get(player.eraId) ?? [];
    if (rulesSetIds.length === 0) {
      return this.unknown('no_rules_set');
    }
    const priced: PricedPlayer = { ...player, sppTotal: player.sppTotal };
    const outcomes = rulesSetIds.map((rulesSetId) =>
      this.outcomeFor(priced, rulesSetId, data),
    );
    return this.combine(player.sppTotal, outcomes);
  }

  private outcomeFor(
    player: PricedPlayer,
    rulesSetId: number,
    data: UnspentSppData,
  ): RulesSetOutcome {
    const costs = data.costs.filter(
      (cost) =>
        cost.rulesSetId === rulesSetId &&
        (cost.leagueId === null || cost.leagueId === player.leagueId),
    );
    if (costs.length === 0) {
      return { kind: 'no_costs' };
    }
    const options = this.candidates.candidates({
      skills: data.skillsByPlayer.get(player.playerId) ?? [],
      trophyGrantedSkillIds:
        data.trophySkillsByPlayer.get(player.playerId) ?? new Set<number>(),
      characteristicIncreases: player.characteristicIncreases,
      skillCategories:
        data.categoriesByRulesSet.get(rulesSetId) ??
        new Map<number, SkillCategory>(),
      positionAccess:
        data.accessByPositionRulesSet.get(
          `${player.positionId}|${rulesSetId}`,
        ) ?? new Map<SkillCategory, SkillAccess>(),
      costs,
    });
    const range = this.spendRange.range(options, costs);
    if (range === null) {
      return { kind: 'inconsistent' };
    }
    const cheapestNextCost = this.spendRange.cheapestCostAt(
      costs,
      options.length + 1,
    );
    return {
      kind: 'fits',
      advancementsGained: options.length,
      ...range,
      cheapestNextCost,
      coversAnother: this.coversAnother(
        player.sppTotal - range.spentMax,
        player.sppTotal - range.spentMin,
        cheapestNextCost,
      ),
    };
  }

  /**
   * The widest range over the rules sets whose costs fit: the lowest spend,
   * the highest spend and the lowest next cost. The verdict is each rules
   * set's own, merged: `yes` or `no` only when all of them say so, otherwise
   * `maybe`. Comparing the merged range against the merged next cost instead
   * would mix figures from different rules sets.
   */
  private combine(
    totalSpp: number,
    outcomes: RulesSetOutcome[],
  ): UnspentSppResult {
    const fits = outcomes.filter(
      (outcome): outcome is FittingOutcome => outcome.kind === 'fits',
    );
    if (fits.length === 0) {
      return this.unknown(
        outcomes.every((outcome) => outcome.kind === 'no_costs')
          ? 'no_costs'
          : 'inconsistent_history',
      );
    }
    const spentMin = Math.min(...fits.map((fit) => fit.spentMin));
    const spentMax = Math.max(...fits.map((fit) => fit.spentMax));
    const nextCosts = fits
      .map((fit) => fit.cheapestNextCost)
      .filter((cost): cost is number => cost !== null);
    const cheapestNextCost =
      nextCosts.length === 0 ? null : Math.min(...nextCosts);
    const unspentMin = totalSpp - spentMax;
    const unspentMax = totalSpp - spentMin;
    return {
      status: 'known',
      totalSpp,
      advancementsGained: fits[0].advancementsGained,
      spentMin,
      spentMax,
      unspentMin,
      unspentMax,
      cheapestNextCost,
      coversAnother: this.mergeVerdicts(fits.map((fit) => fit.coversAnother)),
    };
  }

  private mergeVerdicts(verdicts: CoversAnother[]): CoversAnother {
    const [first] = verdicts;
    return verdicts.every((verdict) => verdict === first) ? first : 'maybe';
  }

  /**
   * `no` when no further advancement exists or even the largest unspent
   * figure falls short, `yes` when even the smallest covers it.
   */
  private coversAnother(
    unspentMin: number,
    unspentMax: number,
    cheapestNextCost: number | null,
  ): CoversAnother {
    if (cheapestNextCost === null || unspentMax < cheapestNextCost) {
      return 'no';
    }
    return unspentMin >= cheapestNextCost ? 'yes' : 'maybe';
  }

  private unknown(reason: UnspentSppUnknownReason): UnspentSppResult {
    return { status: 'unknown', reason };
  }

  private async loadPlayers(ids: number[]): Promise<PlayerFacts[]> {
    const rows = await this.db
      .select({
        playerId: players.id,
        sppTotal: players.sppTotal,
        positionId: players.positionId,
        isStarPlayer: positions.isStarPlayer,
        eraId: teamEras.eraId,
        leagueId: eras.leagueId,
        moveIncreaseCount: players.moveIncreaseCount,
        strengthIncreaseCount: players.strengthIncreaseCount,
        agilityIncreaseCount: players.agilityIncreaseCount,
        passingIncreaseCount: players.passingIncreaseCount,
        armourIncreaseCount: players.armourIncreaseCount,
      })
      .from(players)
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(inArray(players.id, ids));
    return rows.map((row) => ({
      playerId: row.playerId,
      sppTotal: row.sppTotal,
      positionId: row.positionId,
      isStarPlayer: row.isStarPlayer,
      eraId: row.eraId,
      leagueId: row.leagueId,
      characteristicIncreases:
        row.moveIncreaseCount +
        row.strengthIncreaseCount +
        row.agilityIncreaseCount +
        row.passingIncreaseCount +
        row.armourIncreaseCount,
    }));
  }

  /** Queries 2-7, in a fixed order, each covering the whole batch. */
  private async loadData(facts: PlayerFacts[]): Promise<UnspentSppData> {
    const playerIds = facts.map((fact) => fact.playerId);
    const eraRows = await this.db
      .select({
        eraId: eraRulesSets.eraId,
        rulesSetId: eraRulesSets.rulesSetId,
      })
      .from(eraRulesSets)
      .where(
        inArray(
          eraRulesSets.eraId,
          this.distinct(facts.map((fact) => fact.eraId)),
        ),
      );
    const rulesSetIds = this.distinct(eraRows.map((row) => row.rulesSetId));
    const skillRows = await this.db
      .select({
        playerId: playerSkills.playerId,
        skillId: playerSkills.skillId,
        source: playerSkills.source,
      })
      .from(playerSkills)
      .where(inArray(playerSkills.playerId, playerIds));
    // Both columns are nullable in general, but the filter keeps only rows
    // with a player id from the batch and a granted skill.
    const trophyRows = await this.db
      .select({
        playerId: trophyAwards.playerId,
        skillId: trophyAwards.grantedSkillId,
      })
      .from(trophyAwards)
      .where(
        and(
          inArray(trophyAwards.playerId, playerIds),
          isNotNull(trophyAwards.grantedSkillId),
        ),
      );
    const trophySkillsByPlayer = new Map<number, Set<number>>();
    for (const row of trophyRows) {
      const playerId = row.playerId as number;
      const granted = trophySkillsByPlayer.get(playerId) ?? new Set<number>();
      granted.add(row.skillId as number);
      trophySkillsByPlayer.set(playerId, granted);
    }

    return {
      rulesSetIdsByEra: this.group(
        eraRows,
        (row) => row.eraId,
        (row) => row.rulesSetId,
      ),
      skillsByPlayer: this.group(
        skillRows,
        (row) => row.playerId,
        (row) => ({ skillId: row.skillId, source: row.source }),
      ),
      trophySkillsByPlayer,
      ...(await this.loadRulesSetData(
        facts,
        this.distinct(skillRows.map((row) => row.skillId)),
        rulesSetIds,
      )),
    };
  }

  /**
   * Queries 5-7: skill categories, position access and costs under the
   * batch's rules sets. None is run when there is no rules set to ask about.
   */
  private async loadRulesSetData(
    facts: PlayerFacts[],
    skillIds: number[],
    rulesSetIds: number[],
  ): Promise<
    Pick<
      UnspentSppData,
      'categoriesByRulesSet' | 'accessByPositionRulesSet' | 'costs'
    >
  > {
    if (rulesSetIds.length === 0) {
      return {
        categoriesByRulesSet: new Map(),
        accessByPositionRulesSet: new Map(),
        costs: [],
      };
    }
    const categoryRows = await this.db
      .select({
        skillId: skillRulesSets.skillId,
        rulesSetId: skillRulesSets.rulesSetId,
        category: skillRulesSets.category,
      })
      .from(skillRulesSets)
      .where(
        and(
          inArray(skillRulesSets.skillId, skillIds),
          inArray(skillRulesSets.rulesSetId, rulesSetIds),
        ),
      );
    const accessRows = await this.db
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
          inArray(
            positionRulesSets.positionId,
            this.distinct(facts.map((fact) => fact.positionId)),
          ),
          inArray(positionRulesSets.rulesSetId, rulesSetIds),
          eq(positionRulesSetSkillCategories.removed, false),
        ),
      );
    const costs = await this.db
      .select({
        rulesSetId: advancementCosts.rulesSetId,
        leagueId: advancementCosts.leagueId,
        advancementNumber: advancementCosts.advancementNumber,
        advancementKind: advancementCosts.advancementKind,
        skillId: advancementCosts.skillId,
        sppCost: advancementCosts.sppCost,
      })
      .from(advancementCosts)
      .where(
        and(
          inArray(advancementCosts.rulesSetId, rulesSetIds),
          or(
            isNull(advancementCosts.leagueId),
            inArray(
              advancementCosts.leagueId,
              this.distinct(facts.map((fact) => fact.leagueId)),
            ),
          ),
        ),
      );

    const categoriesByRulesSet = new Map<number, Map<number, SkillCategory>>();
    for (const row of categoryRows) {
      const byRulesSet =
        categoriesByRulesSet.get(row.rulesSetId) ??
        new Map<number, SkillCategory>();
      byRulesSet.set(row.skillId, row.category);
      categoriesByRulesSet.set(row.rulesSetId, byRulesSet);
    }
    const accessByPositionRulesSet = new Map<
      string,
      Map<SkillCategory, SkillAccess>
    >();
    for (const row of accessRows) {
      const key = `${row.positionId}|${row.rulesSetId}`;
      const access =
        accessByPositionRulesSet.get(key) ??
        new Map<SkillCategory, SkillAccess>();
      access.set(row.category, row.access);
      accessByPositionRulesSet.set(key, access);
    }
    return { categoriesByRulesSet, accessByPositionRulesSet, costs };
  }

  private group<T, V>(
    items: T[],
    keyOf: (item: T) => number,
    valueOf: (item: T) => V,
  ): Map<number, V[]> {
    const grouped = new Map<number, V[]>();
    for (const item of items) {
      const key = keyOf(item);
      const values = grouped.get(key);
      if (values === undefined) {
        grouped.set(key, [valueOf(item)]);
      } else {
        values.push(valueOf(item));
      }
    }
    return grouped;
  }

  private distinct(ids: number[]): number[] {
    return [...new Set(ids)];
  }
}
