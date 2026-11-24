import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { NAME_EXTERNAL_SYSTEM_NAME } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type { TpFeedHistoryReport } from '../read-tp-feed-history/tp-feed-history-index.service';
import { AdvancementPricingService } from './advancement-pricing.service';
import { CHARACTERISTIC_NAME_BY_KEY } from './characteristic-keys';
import { CharacteristicReplayService } from './characteristic-replay.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FeedSkillResolverService } from './feed-skill-resolver.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import type {
  AdvancementCostRow,
  CandidateRow,
  CharacteristicEvent,
  FillAdvancement,
  PositionAccessRow,
  PositionProfile,
  ResolvedStep,
  SkillCategoryRow,
  SkillNameRow,
  SkipReason,
  StageDecision,
  StatReductionEventRow,
  StoredAdvancementRow,
  TeamCompetitionRow,
} from './fill-plan.types';
import { FREE_EXTRA_SKILL_NAMES } from './fill-plan.types';
import { LastingInjuryProofService } from './lasting-injury-proof.service';
import { PricingRulesSetsService } from './pricing-rules-sets.service';

/** The server's order check prices at most this many paid advancements. */
export const MAX_PAID_ADVANCEMENTS = 6;

export interface AdvancementStageInput {
  candidate: CandidateRow;
  /** His stored total, already known to be present; equals `candidate.sppTotal`. */
  sppTotal: number;
  status: PlayerStatus;
  /** The feed reports matched to him, oldest first. */
  reports: readonly TpFeedHistoryReport[];
  hasStatReduction: boolean;
  /** His stat-reduction match events; read only when hasStatReduction. */
  reductions: readonly StatReductionEventRow[];
  /** Every competition his team era played in, with its last match. */
  competitions: readonly TeamCompetitionRow[];
  /** Per rules set of his era, whether lasting injuries never heal under it. */
  rulesSetsNeverHeal: readonly boolean[];
  /** When he died; null when no death is recorded. */
  diedAt: string | null;
  /** He holds an award of a trophy that grants a skill, or a stored gained free skill. */
  freeSkillRisk: boolean;
  stored: readonly StoredAdvancementRow[];
  /** His position's one profile in his era; undefined when not certain. */
  profile: PositionProfile | undefined;
  skillNames: readonly SkillNameRow[];
  /** The rules sets of his era. */
  rulesSetIds: readonly number[];
  /** The cost rows that apply to his era. */
  costs: readonly AdvancementCostRow[];
  /** Skill categories under the candidates' rules sets. */
  skillCategories: readonly SkillCategoryRow[];
  /** His position's access rows. */
  positionAccess: readonly PositionAccessRow[];
}

/**
 * Decides the fill of a player whose advancements the TP feed reports. His
 * reports, oldest first, are his advancements, and the fill is written only
 * when they are proven:
 *
 * - any stat reductions recorded for him certainly still apply
 *   (LastingInjuryProofService);
 * - his total and unspent SPP are stored, the reports are at most six, all
 *   resolve to stored skills or increases, and no reported skill is free
 *   (Loner, Hatred, a granted skill) or repeats a skill he has;
 * - priced in order under every rules set of his era, they give one set of
 *   costs, the costs add up to exactly his total minus his unspent SPP, and
 *   each is the cost its report shows;
 * - his position's line with the increases and reductions replayed in the
 *   order they happened (CharacteristicReplayService) is certain and valid,
 *   and nothing stored contradicts the entry.
 *
 * The checks run in a fixed order and the first that fails is the reason
 * reported.
 */
@Injectable()
export class AdvancementFillStageService {
  constructor(
    private readonly proof: LastingInjuryProofService,
    private readonly skills: FeedSkillResolverService,
    private readonly pricing: AdvancementPricingService,
    private readonly pricingRulesSets: PricingRulesSetsService,
    private readonly replay: CharacteristicReplayService,
    private readonly validity: CharacteristicValidityService,
    private readonly entries: FillEntryBuilderService,
  ) {}

  decide(input: AdvancementStageInput): StageDecision {
    if (
      input.hasStatReduction &&
      this.proof.prove({
        reductions: input.reductions,
        competitions: input.competitions,
        rulesSetsNeverHeal: input.rulesSetsNeverHeal,
        diedAt: input.diedAt,
      }) === undefined
    ) {
      return { reason: 'lasting-injury-uncertain' };
    }
    if (input.freeSkillRisk) {
      return { reason: 'free-skill-risk' };
    }
    const unspentSpp = input.candidate.unspentSpp;
    if (unspentSpp === null) {
      return { reason: 'unspent-spp-missing' };
    }
    if (unspentSpp < 0 || unspentSpp > input.sppTotal) {
      return { reason: 'spp-does-not-add-up' };
    }
    if (input.reports.length > MAX_PAID_ADVANCEMENTS) {
      return { reason: 'too-many-advancements' };
    }
    const steps = this.skills.resolve({
      reports: input.reports,
      skillNames: input.skillNames,
    });
    if (steps === undefined) {
      return { reason: 'skill-unresolved' };
    }
    if (
      steps.some(
        (step) =>
          step.kind === 'skill' && FREE_EXTRA_SKILL_NAMES.has(step.skillName),
      )
    ) {
      return { reason: 'free-skill-risk' };
    }
    const profile = input.profile;
    if (profile === undefined) {
      return { reason: 'position-ambiguous' };
    }
    if (this.repeatsSkill(steps, profile)) {
      return { reason: 'duplicate-skill' };
    }
    if (this.pricingRulesSets.hasConflictingAccess(input.positionAccess)) {
      return { reason: 'skill-category-mismatch' };
    }
    const priceReason = this.priceReason(
      steps,
      input,
      input.sppTotal - unspentSpp,
    );
    if (priceReason !== undefined) {
      return { reason: priceReason };
    }
    return this.entry({ input, steps, profile, unspentSpp });
  }

  private entry(parts: {
    input: AdvancementStageInput;
    steps: ResolvedStep[];
    profile: PositionProfile;
    unspentSpp: number;
  }): StageDecision {
    const { input, steps, profile, unspentSpp } = parts;
    const outcome = this.replay.replay({
      line: profile.line,
      formats: profile.formats,
      events: this.events(input, steps),
    });
    if (outcome.kind === 'order-uncertain') {
      return { reason: 'characteristic-order-uncertain' };
    }
    if (
      outcome.kind === 'unapplicable' ||
      !this.validity.isValid({ line: outcome.line, formats: profile.formats })
    ) {
      return { reason: 'invalid-characteristics' };
    }
    const line = outcome.line;
    const { candidate, stored } = input;
    if (
      this.entries.contradicts({ candidate, stored, profile, line, unspentSpp })
    ) {
      return { reason: 'stored-data-contradicts' };
    }
    return {
      entry: this.entries.build({
        candidate,
        line,
        profile,
        sppTotal: input.sppTotal,
        unspentSpp,
        status: input.status,
        advancements: steps.map((step) => this.advancement(step)),
      }),
    };
  }

  /** The skip reason pricing gives, or undefined when the steps are proven. */
  private priceReason(
    steps: ResolvedStep[],
    input: AdvancementStageInput,
    spent: number,
  ): SkipReason | undefined {
    const outcome = this.pricing.price({
      steps,
      rulesSets: this.pricingRulesSets.build({
        rulesSetIds: input.rulesSetIds,
        costs: input.costs,
        skillCategories: input.skillCategories,
        positionAccess: input.positionAccess,
      }),
    });
    if (outcome.kind === 'granted-skill') {
      return 'free-skill-risk';
    }
    if (outcome.kind === 'category-mismatch') {
      return 'skill-category-mismatch';
    }
    if (outcome.kind === 'disagree') {
      return 'rules-sets-disagree';
    }
    if (outcome.kind === 'unpriced' || outcome.total !== spent) {
      return 'spp-does-not-add-up';
    }
    return outcome.stepCosts.some((cost, at) => cost !== steps[at].reportedCost)
      ? 'feed-cost-mismatch'
      : undefined;
  }

  /** His increases at their reports' times, and his reductions at their matches' times. */
  private events(
    input: AdvancementStageInput,
    steps: ResolvedStep[],
  ): CharacteristicEvent[] {
    const increases = steps.flatMap((step, at): CharacteristicEvent[] =>
      step.kind === 'characteristic'
        ? [
            {
              kind: 'increase',
              characteristic: step.characteristic,
              at: input.reports[at].timestamp,
            },
          ]
        : [],
    );
    const reductions = input.hasStatReduction ? input.reductions : [];
    return [
      ...increases,
      ...reductions.map((row): CharacteristicEvent => ({
        kind: 'reduction',
        characteristic: row.characteristic,
        at: row.playedAt,
      })),
    ];
  }

  /** Whether a reported skill repeats a starting skill or an earlier report, in any variant. */
  private repeatsSkill(
    steps: ResolvedStep[],
    profile: PositionProfile,
  ): boolean {
    // A player never gains a skill he has, whatever its variant.
    const seen = new Set(profile.skills.map((skill) => skill.skillId));
    for (const step of steps) {
      if (step.kind !== 'skill') {
        continue;
      }
      if (seen.has(step.skillId)) {
        return true;
      }
      seen.add(step.skillId);
    }
    return false;
  }

  private advancement(step: ResolvedStep): FillAdvancement {
    if (step.kind === 'characteristic') {
      return {
        characteristic: CHARACTERISTIC_NAME_BY_KEY[step.characteristic],
      };
    }
    return {
      skill: { system: NAME_EXTERNAL_SYSTEM_NAME, id: step.nameId },
      ...(step.attributeValue === null
        ? {}
        : { attributeValue: step.attributeValue }),
      source: step.selection,
    };
  }
}
