import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  and,
  DB,
  eq,
  eraRulesSets,
  eras,
  inArray,
  isNull,
  or,
  playerAdvancements,
  players,
  positionRulesSets,
  positionRulesSetSkillCategories,
  positions,
  skillRulesSets,
  teamEras,
} from '@blood-bowl-tracker/db';
import type {
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementPricingModelService } from './advancement-pricing-model.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import { StoredUnspentSppSettlementService } from './stored-unspent-spp-settlement.service';
import type {
  ApplicableAdvancementCost,
  FittingOutcome,
  ModelledUnspentSpp,
  PlayerSkillEntry,
  RulesSetAdvancementInput,
  RulesSetOutcome,
  UnspentSppResult,
  UnspentSppUnknownReason,
} from './unspent-spp.types';
import { UnspentSppCombinationService } from './unspent-spp-combination.service';

/** One player, with what decides which rules sets and costs apply to them. */
interface PlayerFacts {
  playerId: number;
  sppTotal: number | null;
  storedUnspentSpp: number | null;
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
  /** Rules set id -> skill id -> the skill's category under that rules set. */
  categoriesByRulesSet: Map<number, Map<number, SkillCategory>>;
  /** `positionId|rulesSetId` -> category -> the position's access to it. */
  accessByPositionRulesSet: Map<string, Map<SkillCategory, SkillAccess>>;
  costs: StoredCost[];
}

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
 *
 * A stored `players.unspent_spp` inside the modelled range settles the result
 * to that one value; one outside it leaves the range and flags the result
 * (`storedVerdict`). `modelledForPlayers` is what `UnspentSppDecisionService`
 * uses to decide what to store; it never reads the stored figure.
 */
@Injectable()
export class UnspentSppService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly candidates: AdvancementKindCandidatesService,
    private readonly spendRange: AdvancementSpendRangeService,
    private readonly pricingModel: AdvancementPricingModelService,
    private readonly settlement: StoredUnspentSppSettlementService,
    private readonly combination: UnspentSppCombinationService,
  ) {}

  /** One player's result, or undefined when no such player exists. */
  async forPlayer(playerId: number): Promise<UnspentSppResult | undefined> {
    return (await this.forPlayers([playerId])).get(playerId);
  }

  /**
   * Each requested player's result, keyed by player id. A requested id with
   * no player is absent. The whole batch is loaded in one query per table.
   *
   * The player ids go into a single unchunked `inArray`, so the caller keeps
   * the batch bounded (the importers send their SPP adjustments in chunks of
   * 500); a very large batch could exceed Postgres's bind-parameter limit.
   */
  async forPlayers(
    playerIds: number[],
  ): Promise<Map<number, UnspentSppResult>> {
    const evaluated = await this.evaluate(playerIds, null, true);
    return new Map(
      [...evaluated].map(([playerId, { result }]) => [playerId, result]),
    );
  }

  /**
   * Each requested player's modelled range with their era's pricing model,
   * for working out what to store. The stored unspent figure is ignored,
   * since it is what the caller is about to replace, and `sppTotals`
   * replaces the stored total of every player it names. Same batching rules
   * as `forPlayers`.
   */
  async modelledForPlayers(
    playerIds: number[],
    sppTotals?: ReadonlyMap<number, number>,
  ): Promise<Map<number, ModelledUnspentSpp>> {
    return this.evaluate(playerIds, sppTotals ?? null, false);
  }

  /**
   * What each rules set of each requested player's era makes of their
   * advancements, for working out what those advancements were. A requested
   * id with no player is absent, and so is a star player, whose skills are
   * never advancements. A rules set with no cost rows for the player is left
   * out. Same batching rules as `forPlayers`.
   */
  async advancementInputsForPlayers(
    playerIds: number[],
  ): Promise<Map<number, RulesSetAdvancementInput[]>> {
    const inputs = new Map<number, RulesSetAdvancementInput[]>();
    const ids = this.distinct(playerIds);
    if (ids.length === 0) {
      return inputs;
    }
    const facts = await this.loadPlayers(ids);
    if (facts.length === 0) {
      return inputs;
    }
    const data = await this.loadData(facts);
    for (const player of facts) {
      if (player.isStarPlayer) {
        continue;
      }
      inputs.set(
        player.playerId,
        (data.rulesSetIdsByEra.get(player.eraId) ?? [])
          .map((rulesSetId) => this.rulesSetInput(player, rulesSetId, data))
          .filter((input) => input.costs.length > 0),
      );
    }
    return inputs;
  }

  private async evaluate(
    playerIds: number[],
    sppTotals: ReadonlyMap<number, number> | null,
    settle: boolean,
  ): Promise<Map<number, ModelledUnspentSpp>> {
    const results = new Map<number, ModelledUnspentSpp>();
    const ids = this.distinct(playerIds);
    if (ids.length === 0) {
      return results;
    }
    const loaded = await this.loadPlayers(ids);
    if (loaded.length === 0) {
      return results;
    }
    const facts = loaded.map((fact) => ({
      ...fact,
      sppTotal: sppTotals?.get(fact.playerId) ?? fact.sppTotal,
      storedUnspentSpp: settle ? fact.storedUnspentSpp : null,
    }));
    const data = await this.loadData(facts);
    for (const player of facts) {
      results.set(player.playerId, {
        pricingModel: this.pricingModel.modelFor(
          data.rulesSetIdsByEra.get(player.eraId) ?? [],
          data.costs,
        ),
        result: this.resultFor(player, data),
      });
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
    const result = this.combination.combine(player.sppTotal, outcomes);
    if (result.status === 'unknown') {
      return result;
    }
    return this.settlement.settle(result, {
      stored: player.storedUnspentSpp,
      nextCosts: outcomes
        .filter((outcome): outcome is FittingOutcome => outcome.kind === 'fits')
        .map((fit) => fit.cheapestNextCost),
    });
  }

  private rulesSetInput(
    player: PlayerFacts,
    rulesSetId: number,
    data: UnspentSppData,
  ): RulesSetAdvancementInput {
    const costs = data.costs.filter(
      (cost) =>
        cost.rulesSetId === rulesSetId &&
        (cost.leagueId === null || cost.leagueId === player.leagueId),
    );
    return {
      rulesSetId,
      pricingModel: this.pricingModel.modelFor([rulesSetId], costs),
      costs,
      candidatesInput: {
        skills: data.skillsByPlayer.get(player.playerId) ?? [],
        characteristicIncreases: player.characteristicIncreases,
        skillCategories:
          data.categoriesByRulesSet.get(rulesSetId) ??
          new Map<number, SkillCategory>(),
        positionAccess:
          data.accessByPositionRulesSet.get(
            `${player.positionId}|${rulesSetId}`,
          ) ?? new Map<SkillCategory, SkillAccess>(),
        costs,
      },
    };
  }

  private outcomeFor(
    player: PricedPlayer,
    rulesSetId: number,
    data: UnspentSppData,
  ): RulesSetOutcome {
    const { costs, candidatesInput } = this.rulesSetInput(
      player,
      rulesSetId,
      data,
    );
    if (costs.length === 0) {
      return { kind: 'no_costs' };
    }
    const options = this.candidates.candidates(candidatesInput);
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
      coversAnother: this.combination.coversAnother(
        player.sppTotal - range.spentMax,
        player.sppTotal - range.spentMin,
        cheapestNextCost,
      ),
    };
  }

  private unknown(reason: UnspentSppUnknownReason): UnspentSppResult {
    return { status: 'unknown', reason };
  }

  private async loadPlayers(ids: number[]): Promise<PlayerFacts[]> {
    const rows = await this.db
      .select({
        playerId: players.id,
        sppTotal: players.sppTotal,
        unspentSpp: players.unspentSpp,
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
      storedUnspentSpp: row.unspentSpp,
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

  /** Queries 2-6, in a fixed order, each covering the whole batch. */
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
    const storedRows = await this.db
      .select({
        playerId: playerAdvancements.playerId,
        skillId: playerAdvancements.skillId,
        source: playerAdvancements.source,
        isFreeExtra: playerAdvancements.isFreeExtra,
      })
      .from(playerAdvancements)
      .where(inArray(playerAdvancements.playerId, playerIds));
    const skillRows = storedRows.flatMap((row) =>
      row.skillId === null ? [] : [{ ...row, skillId: row.skillId }],
    );

    return {
      rulesSetIdsByEra: this.group(
        eraRows,
        (row) => row.eraId,
        (row) => row.rulesSetId,
      ),
      skillsByPlayer: this.group(
        skillRows,
        (row) => row.playerId,
        (row) => ({
          skillId: row.skillId,
          source: row.source,
          isFreeExtra: row.isFreeExtra,
        }),
      ),
      ...(await this.loadRulesSetData(
        facts,
        this.distinct(skillRows.map((row) => row.skillId)),
        rulesSetIds,
      )),
    };
  }

  /**
   * Queries 4-6: skill categories, position access and costs under the
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
