import type {
  PlayerCharacteristic,
  PlayerStatus,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type { TpFeedHistoryReport } from '../read-tp-feed-history/tp-feed-history-index.service';
import { AdvancementPricingService } from './advancement-pricing.service';
import { CharacteristicChangeService } from './characteristic-change.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FeedSkillResolverService } from './feed-skill-resolver.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import type {
  AdvancementCostRow,
  CandidateRow,
  CharacteristicKey,
  CharacteristicLine,
  FillAdvancement,
  PositionAccessRow,
  PositionProfile,
  ResolvedStep,
  RulesSetPricingInput,
  SkillCategoryRow,
  SkillNameRow,
  SkipReason,
  StageDecision,
  StoredAdvancementRow,
} from './fill-plan.types';
import { FREE_EXTRA_SKILL_NAMES } from './fill-plan.types';

/** The server's order check prices at most this many paid advancements. */
export const MAX_PAID_ADVANCEMENTS = 6;

const CHARACTERISTIC_NAMES: Record<CharacteristicKey, PlayerCharacteristic> = {
  ma: 'MA',
  st: 'ST',
  ag: 'AG',
  pa: 'PA',
  av: 'AV',
};

export interface AdvancementStageInput {
  candidate: CandidateRow;
  /** His stored total, already known to be present; equals `candidate.sppTotal`. */
  sppTotal: number;
  status: PlayerStatus;
  /** The feed reports matched to him, oldest first. */
  reports: readonly TpFeedHistoryReport[];
  hasStatReduction: boolean;
  /** He holds a trophy award, or a stored gained free skill. */
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
 * - his total and unspent SPP are stored, the reports are at most six, all
 *   resolve to stored skills or increases, and no reported skill is free
 *   (Loner, Hatred, a granted skill) or repeats a skill he has;
 * - priced in order under every rules set of his era, they give one set of
 *   costs, the costs add up to exactly his total minus his unspent SPP, and
 *   each is the cost its report shows;
 * - his position's line with the increases applied is valid, and nothing
 *   stored contradicts the entry.
 *
 * A player with stat reductions is not filled: injuries and advancements
 * together are not proven here. The checks run in a fixed order and the
 * first that fails is the reason reported.
 */
@Injectable()
export class AdvancementFillStageService {
  constructor(
    private readonly skills: FeedSkillResolverService,
    private readonly pricing: AdvancementPricingService,
    private readonly changes: CharacteristicChangeService,
    private readonly validity: CharacteristicValidityService,
    private readonly entries: FillEntryBuilderService,
  ) {}

  decide(input: AdvancementStageInput): StageDecision {
    if (input.hasStatReduction) {
      return { reason: 'advancement-and-injury' };
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
    if (this.hasConflictingAccess(input.positionAccess)) {
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
    const line = this.line(steps, profile);
    if (
      line === undefined ||
      !this.validity.isValid({ line, formats: profile.formats })
    ) {
      return { reason: 'invalid-characteristics' };
    }
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
      rulesSets: this.rulesSets(input),
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

  /** Whether one rules set gives a category two different accesses; identical duplicates are fine. */
  private hasConflictingAccess(rows: readonly PositionAccessRow[]): boolean {
    const seen = new Map<string, string>();
    return rows.some((row) => {
      const key = JSON.stringify([row.rulesSetId, row.category]);
      const earlier = seen.get(key);
      seen.set(key, row.access);
      return earlier !== undefined && earlier !== row.access;
    });
  }

  private rulesSets(input: AdvancementStageInput): RulesSetPricingInput[] {
    return input.rulesSetIds.map((rulesSetId) => ({
      rulesSetId,
      costs: input.costs.filter((cost) => cost.rulesSetId === rulesSetId),
      skillCategories: new Map(
        input.skillCategories
          .filter((row) => row.rulesSetId === rulesSetId)
          .map((row) => [row.skillId, row.category]),
      ),
      positionAccess: new Map(
        input.positionAccess
          .filter((row) => row.rulesSetId === rulesSetId)
          .map((row) => [row.category, row.access]),
      ),
    }));
  }

  /** The position's line with every increase applied in order. */
  private line(
    steps: ResolvedStep[],
    profile: PositionProfile,
  ): CharacteristicLine | undefined {
    let line = profile.line;
    for (const step of steps) {
      if (step.kind !== 'characteristic') {
        continue;
      }
      const next = this.changes.improve({
        line,
        formats: profile.formats,
        characteristic: step.characteristic,
      });
      if (next === undefined) {
        return undefined;
      }
      line = next;
    }
    return line;
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
      return { characteristic: CHARACTERISTIC_NAMES[step.characteristic] };
    }
    return {
      skill: { system: 'Name', id: step.nameId },
      ...(step.attributeValue === null
        ? {}
        : { attributeValue: step.attributeValue }),
      source: step.selection,
    };
  }
}
