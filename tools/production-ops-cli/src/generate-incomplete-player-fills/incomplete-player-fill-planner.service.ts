import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type { TpFeedHistoryReport } from '../read-tp-feed-history/tp-feed-history-index.service';
import type { AdvancementStageInput } from './advancement-fill-stage.service';
import { AdvancementFillStageService } from './advancement-fill-stage.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FeedPlayerMatcherService } from './feed-player-matcher.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import type {
  AdvancementCostRow,
  CandidateRow,
  EraRulesSetRow,
  FeedMatch,
  FillEntry,
  FillPlan,
  FillPlannerInput,
  FillReport,
  FillStage,
  PositionAccessRow,
  PositionProfile,
  PositionRulesSetRow,
  PositionSkillRow,
  SkillCategoryRow,
  SkillNameRow,
  SkipReason,
  StageDecision,
  StatReductionEventRow,
  StoredAdvancementRow,
  TeamCompetitionRow,
} from './fill-plan.types';
import {
  FREE_EXTRA_SKILL_NAMES,
  LONER_SKILL_NAME,
  SKIP_REASONS,
} from './fill-plan.types';
import { InjuryFillStageService } from './injury-fill-stage.service';
import { PositionProfileService } from './position-profile.service';

interface PlannerIndex {
  statReduction: Set<number>;
  death: Set<number>;
  stored: Map<number, StoredAdvancementRow[]>;
  freeSkillRisk: Set<number>;
  ongoingTeams: Set<number>;
  positionRulesSets: Map<string, PositionRulesSetRow[]>;
  positionSkills: Map<number, PositionSkillRow[]>;
  eraRulesSets: Map<number, EraRulesSetRow[]>;
  feed: Map<number, FeedMatch>;
  skillNames: SkillNameRow[];
  skillCategories: SkillCategoryRow[];
  positionAccess: Map<number, PositionAccessRow[]>;
  costs: Map<number, AdvancementCostRow[]>;
  reductions: Map<number, StatReductionEventRow[]>;
  competitions: Map<number, TeamCompetitionRow[]>;
  bigGuyPositions: Set<string>;
  lonerSkillIds: Set<number>;
}

type Decision = { entry: FillEntry; stage: FillStage } | { reason: SkipReason };

/** A candidate past the shared gates, with his stored total. */
interface Gated {
  candidate: CandidateRow;
  sppTotal: number;
  index: PlannerIndex;
}

/**
 * Plans the `incompletePlayerFills` entries for incomplete TP players whose
 * data can be proven, and reports everyone else by the first reason that
 * applies. Every candidate passes the shared gates (ongoing
 * competition, total stored, era priced); then:
 *
 * - a player the TP feed reports name goes to AdvancementFillStageService,
 *   with his stat reductions, which must certainly last when he has any;
 * - a player whose total is below the cheapest advancement of his era, and
 *   with no free-skill risk, goes to InjuryFillStageService when stat
 *   reductions are recorded for him;
 * - a marked journeyman is filled only as one with no advancements, with
 *   `journeyman: true` and his starting Loner left to the server (see
 *   `journeyman`);
 * - otherwise he provably has no advancements, and is filled with his
 *   position's line and starting skills and his whole total unspent.
 *
 * A player the feed matcher cannot tell apart from another possible owner of
 * his reports is skipped, and a player the feed does not name is never taken
 * to have advanced: his total must be below the cheapest advancement, which
 * proves he has none.
 *
 * Pure decision logic, with no I/O; its collaborators are pure as well.
 */
@Injectable()
export class IncompletePlayerFillPlannerService {
  constructor(
    private readonly validity: CharacteristicValidityService,
    private readonly profiles: PositionProfileService,
    private readonly entries: FillEntryBuilderService,
    private readonly matcher: FeedPlayerMatcherService,
    private readonly advancementStage: AdvancementFillStageService,
    private readonly injuryStage: InjuryFillStageService,
  ) {}

  plan(input: FillPlannerInput): FillPlan {
    const feed =
      input.feed === null
        ? null
        : this.matcher.match({
            reports: input.feed,
            rosters: input.teamRosters,
            players: input.teamPlayers,
            pricing: {
              paidAdvancements: input.paidAdvancements,
              skillNames: input.skillNames,
              eraRulesSets: input.eraRulesSets,
              advancementCosts: input.advancementCosts,
              skillCategories: input.skillCategories,
              positionAccess: input.positionAccess,
            },
          });
    const index = this.index(
      input,
      feed?.byPlayer ?? new Map<number, FeedMatch>(),
    );
    const skipped = Object.fromEntries(
      SKIP_REASONS.map((reason) => [reason, { count: 0, players: [] }]),
    ) as unknown as FillReport['skipped'];
    const eligibleByStage: Record<FillStage, number> = {
      noAdvancement: 0,
      advancement: 0,
      injuryOnly: 0,
    };
    let journeymenFilled = 0;
    const entries: FillEntry[] = [];
    const candidates = [...input.candidates].sort(
      (a, b) => Number(a.tpId) - Number(b.tpId) || this.compare(a.tpId, b.tpId),
    );
    for (const candidate of candidates) {
      const decision = this.decide(candidate, index);
      if ('entry' in decision) {
        entries.push(decision.entry);
        eligibleByStage[decision.stage] += 1;
        if (decision.entry.journeyman === true) {
          journeymenFilled += 1;
        }
      } else {
        skipped[decision.reason].count += 1;
        skipped[decision.reason].players.push(candidate.tpId);
      }
    }
    return {
      entries,
      report: {
        considered: candidates.length,
        eligible: entries.length,
        eligibleByStage,
        journeymenFilled,
        feed: feed?.summary ?? null,
        skipped,
      },
    };
  }

  private decide(candidate: CandidateRow, index: PlannerIndex): Decision {
    // His data is a moving target, and his stored total may understate his
    // real one while SPP adjustments estimate the competition in progress.
    if (index.ongoingTeams.has(candidate.teamId)) {
      return { reason: 'team-in-ongoing-competition' };
    }
    const sppTotal = candidate.sppTotal;
    if (sppTotal === null || sppTotal < 0) {
      return { reason: 'spp-missing' };
    }
    const cheapest = this.cheapestCost(
      index.eraRulesSets.get(candidate.eraId) ?? [],
    );
    if (cheapest === undefined) {
      return { reason: 'era-unpriced' };
    }
    const gated: Gated = { candidate, sppTotal, index };
    if (candidate.isJourneyman) {
      return this.journeyman(gated, cheapest);
    }
    const match = index.feed.get(candidate.playerId);
    if (match?.kind === 'ambiguous') {
      return { reason: 'feed-match-ambiguous' };
    }
    if (match?.kind === 'reports') {
      return this.staged(
        'advancement',
        this.advancementStage.decide(
          this.advancementInput(gated, match.reports),
        ),
      );
    }
    if (sppTotal >= cheapest) {
      return { reason: 'spp-too-high' };
    }
    if (this.freeSkillRisk(gated)) {
      return { reason: 'free-skill-risk' };
    }
    if (index.statReduction.has(candidate.playerId)) {
      return this.staged(
        'injuryOnly',
        this.injuryStage.decide({
          candidate,
          sppTotal,
          status: this.status(gated),
          reductions: index.reductions.get(candidate.playerId) ?? [],
          competitions: index.competitions.get(candidate.playerId) ?? [],
          stored: this.stored(gated),
          profile: this.profile(candidate, index),
        }),
      );
    }
    return this.noAdvancement(gated);
  }

  /**
   * A marked journeyman, past the shared gates: filled only as one who has
   * not advanced. A Big Guy position is not a basic one a journeyman is
   * drawn from, and his stat reductions are not reconstructed, so either
   * skips him as `journeyman`. Feed reports naming him mean either that he
   * advanced, and so was recruited, or that the key names someone else, so
   * any feed match skips him as `feed-match-ambiguous`. His stored starting
   * Loner is not a gained free skill, so it is no free-skill risk.
   */
  private journeyman(gated: Gated, cheapest: number): Decision {
    const { candidate, sppTotal, index } = gated;
    if (
      index.bigGuyPositions.has(`${candidate.positionId}|${candidate.eraId}`)
    ) {
      return { reason: 'journeyman' };
    }
    if (index.feed.has(candidate.playerId)) {
      return { reason: 'feed-match-ambiguous' };
    }
    if (sppTotal >= cheapest) {
      return { reason: 'spp-too-high' };
    }
    if (this.freeSkillRisk(gated)) {
      return { reason: 'free-skill-risk' };
    }
    if (index.statReduction.has(candidate.playerId)) {
      return { reason: 'journeyman' };
    }
    return this.noAdvancement(gated);
  }

  /** A player too low on SPP to have advanced, with no stat reduction. */
  private noAdvancement(gated: Gated): Decision {
    const { candidate, sppTotal, index } = gated;
    const found = this.profile(candidate, index);
    if (found === undefined) {
      return { reason: 'position-ambiguous' };
    }
    // A journeyman's Loner is the server's: left out of his entry and of
    // the check against what is stored.
    const profile = candidate.isJourneyman
      ? {
          ...found,
          skills: found.skills.filter(
            (skill) => !index.lonerSkillIds.has(skill.skillId),
          ),
        }
      : found;
    if (
      !this.validity.isValid({ line: profile.line, formats: profile.formats })
    ) {
      return { reason: 'invalid-characteristics' };
    }
    const line = profile.line;
    const stored = this.stored(gated).filter(
      (row) => !(candidate.isJourneyman && this.isStartingLoner(row)),
    );
    if (
      this.entries.contradicts({
        candidate,
        stored,
        profile,
        line,
        unspentSpp: sppTotal,
      })
    ) {
      return { reason: 'stored-data-contradicts' };
    }
    return {
      entry: this.entries.build({
        candidate,
        line,
        profile,
        sppTotal,
        unspentSpp: sppTotal,
        status: this.status(gated),
        advancements: [],
      }),
      stage: 'noAdvancement',
    };
  }

  private advancementInput(
    gated: Gated,
    reports: TpFeedHistoryReport[],
  ): AdvancementStageInput {
    const { candidate, sppTotal, index } = gated;
    return {
      candidate,
      sppTotal,
      status: this.status(gated),
      reports,
      hasStatReduction: index.statReduction.has(candidate.playerId),
      reductions: index.reductions.get(candidate.playerId) ?? [],
      competitions: index.competitions.get(candidate.playerId) ?? [],
      freeSkillRisk: this.freeSkillRisk(gated),
      stored: this.stored(gated),
      profile: this.profile(candidate, index),
      skillNames: index.skillNames,
      rulesSetIds: (index.eraRulesSets.get(candidate.eraId) ?? []).map(
        (row) => row.rulesSetId,
      ),
      costs: index.costs.get(candidate.eraId) ?? [],
      skillCategories: index.skillCategories,
      positionAccess: index.positionAccess.get(candidate.positionId) ?? [],
    };
  }

  private staged(stage: FillStage, decision: StageDecision): Decision {
    return 'entry' in decision ? { entry: decision.entry, stage } : decision;
  }

  private stored(gated: Gated): StoredAdvancementRow[] {
    return gated.index.stored.get(gated.candidate.playerId) ?? [];
  }

  private status(gated: Gated): PlayerStatus {
    return this.entries.status(
      gated.candidate,
      gated.index.death.has(gated.candidate.playerId),
    );
  }

  /** An award of a trophy that grants a skill, or a stored gained free skill. */
  private freeSkillRisk(gated: Gated): boolean {
    return (
      gated.index.freeSkillRisk.has(gated.candidate.playerId) ||
      this.stored(gated).some((row) => this.isGainedFreeSkill(row))
    );
  }

  private profile(
    candidate: CandidateRow,
    index: PlannerIndex,
  ): PositionProfile | undefined {
    const rows =
      index.positionRulesSets.get(
        `${candidate.positionId}|${candidate.eraId}`,
      ) ?? [];
    return this.profiles.resolve({
      rows,
      skills: rows.flatMap(
        (row) => index.positionSkills.get(row.positionRulesSetId) ?? [],
      ),
    });
  }

  /** Code-unit order, so the result does not depend on the runtime's locale. */
  private compare(a: string, b: string): number {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  }

  /** Undefined when the era has no rules set, or one that prices nothing. */
  private cheapestCost(rows: EraRulesSetRow[]): number | undefined {
    const costs: number[] = [];
    for (const row of rows) {
      if (row.cheapestCost === null) {
        return undefined;
      }
      costs.push(row.cheapestCost);
    }
    return costs.length === 0 ? undefined : Math.min(...costs);
  }

  private isStartingLoner(row: StoredAdvancementRow): boolean {
    return row.source === 'starting' && row.skillName === LONER_SKILL_NAME;
  }

  private isGainedFreeSkill(row: StoredAdvancementRow): boolean {
    if (row.source === 'starting' || row.source === 'characteristic') {
      return false;
    }
    return row.isFreeExtra || FREE_EXTRA_SKILL_NAMES.has(row.skillName ?? '');
  }

  private index(
    input: FillPlannerInput,
    feed: Map<number, FeedMatch>,
  ): PlannerIndex {
    return {
      statReduction: new Set(input.statReductionPlayerIds),
      death: new Set(input.deathPlayerIds),
      stored: this.groupBy(input.storedAdvancements, (row) => row.playerId),
      freeSkillRisk: new Set(input.freeSkillRiskPlayerIds),
      ongoingTeams: new Set(input.ongoingTeamIds),
      positionRulesSets: this.groupBy(
        input.positionRulesSets,
        (row) => `${row.positionId}|${row.eraId}`,
      ),
      positionSkills: this.groupBy(
        input.positionSkills,
        (row) => row.positionRulesSetId,
      ),
      eraRulesSets: this.groupBy(input.eraRulesSets, (row) => row.eraId),
      feed,
      skillNames: input.skillNames,
      skillCategories: input.skillCategories,
      positionAccess: this.groupBy(
        input.positionAccess,
        (row) => row.positionId,
      ),
      costs: this.groupBy(input.advancementCosts, (row) => row.eraId),
      reductions: this.groupBy(
        input.statReductionEvents,
        (row) => row.playerId,
      ),
      competitions: this.groupBy(input.teamCompetitions, (row) => row.playerId),
      bigGuyPositions: new Set(
        input.bigGuyPositions.map((row) => `${row.positionId}|${row.eraId}`),
      ),
      lonerSkillIds: new Set(
        input.skillNames
          .filter((row) => row.skillName === LONER_SKILL_NAME)
          .map((row) => row.skillId),
      ),
    };
  }

  private groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
    const grouped = new Map<K, T[]>();
    for (const row of rows) {
      const group = grouped.get(key(row)) ?? [];
      group.push(row);
      grouped.set(key(row), group);
    }
    return grouped;
  }
}
