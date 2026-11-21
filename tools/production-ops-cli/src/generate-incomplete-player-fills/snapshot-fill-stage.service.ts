import { Injectable } from '@nestjs/common';

import type { TpRosterSnapshotVariant } from '../read-tp-roster-snapshots/tp-roster-snapshots.schema';
import {
  type AdvancementStageInput,
  MAX_PAID_ADVANCEMENTS,
} from './advancement-fill-stage.service';
import { CharacteristicReplayService } from './characteristic-replay.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import type {
  CharacteristicEvent,
  PositionProfile,
  SkipReason,
  StageDecision,
} from './fill-plan.types';
import { FREE_EXTRA_SKILL_NAMES } from './fill-plan.types';
import { LastingInjuryProofService } from './lasting-injury-proof.service';
import { PricingRulesSetsService } from './pricing-rules-sets.service';
import type { TpSkillIdRow } from './snapshot-fill.types';
import {
  type GainedSkill,
  type OrderSearchOutcome,
  SnapshotOrderSearchService,
  type SnapshotStep,
} from './snapshot-order-search.service';
import {
  type SnapshotSkill,
  SnapshotSkillResolverService,
} from './snapshot-skill-resolver.service';

export interface SnapshotStageInput extends Omit<
  AdvancementStageInput,
  'reports'
> {
  /** The states his TP files show; undefined when none shows him. */
  snapshot: readonly TpRosterSnapshotVariant[] | undefined;
  /** The `tourplay.net` ids (lineUpMasterIds) of his stored position. */
  positionTpIds: readonly string[];
  tpSkillIds: readonly TpSkillIdRow[];
  attributedSkillIds: ReadonlySet<number>;
}

const SEARCH_REASONS: Record<
  Exclude<OrderSearchOutcome['kind'], 'unique'>,
  SkipReason
> = {
  none: 'snapshot-spend-mismatch',
  ambiguous: 'snapshot-order-ambiguous',
  'granted-skill': 'free-skill-risk',
  'category-mismatch': 'skill-category-mismatch',
  disagree: 'rules-sets-disagree',
};

/**
 * Decides the fill of a player too rich in SPP to be proven unadvanced,
 * from what his downloaded TP match and roster files show of him: his
 * level (his paid advancements), his skills by TP id, and his total and
 * unspent SPP. The files must show him in one state that agrees with what
 * is stored. His gained skills are the snapshot's skills less his
 * position's starting skills, each starting skill shown exactly as often as
 * his position has it, and they must be distinct and number exactly his
 * level, so no characteristic increase or free skill hides among them. At
 * most six are searched, since the order search grows factorially. Exactly
 * one order and chosen-or-random source of them must cost the SPP he spent
 * (SnapshotOrderSearchService). Any stat reductions recorded for him must
 * certainly last, and are applied to his position's line. The checks run
 * in a fixed order and the first that fails is the reason reported.
 *
 * Pure decision logic, with no I/O; its collaborators are pure as well.
 */
@Injectable()
export class SnapshotFillStageService {
  constructor(
    private readonly proof: LastingInjuryProofService,
    private readonly skills: SnapshotSkillResolverService,
    private readonly order: SnapshotOrderSearchService,
    private readonly pricingRulesSets: PricingRulesSetsService,
    private readonly replay: CharacteristicReplayService,
    private readonly validity: CharacteristicValidityService,
    private readonly entries: FillEntryBuilderService,
  ) {}

  decide(input: SnapshotStageInput): StageDecision {
    const states = input.snapshot;
    if (states === undefined || states.length === 0) {
      return { reason: 'snapshot-missing' };
    }
    if (states.length > 1) {
      return { reason: 'snapshot-disagrees' };
    }
    const state = states[0];
    if (this.conflictsStored(input, state)) {
      return { reason: 'snapshot-conflicts-stored' };
    }
    const gate = this.gate(input, state);
    if ('reason' in gate) {
      return gate;
    }
    const { profile } = gate;
    const resolved = this.skills.resolve({
      masterIds: state.skillMasterIds,
      tpSkillIds: input.tpSkillIds,
      skillNames: input.skillNames,
      attributedSkillIds: input.attributedSkillIds,
    });
    if (resolved === undefined) {
      return { reason: 'skill-unresolved' };
    }
    const gained = this.gained(resolved, profile);
    if (typeof gained === 'string') {
      return { reason: gained };
    }
    const countReason = this.countReason(state.level, gained.length);
    if (countReason !== undefined) {
      return { reason: countReason };
    }
    if (this.pricingRulesSets.hasConflictingAccess(input.positionAccess)) {
      return { reason: 'skill-category-mismatch' };
    }
    const search = this.order.search({
      skills: gained,
      rulesSets: this.pricingRulesSets.build({
        rulesSetIds: input.rulesSetIds,
        costs: input.costs,
        skillCategories: input.skillCategories,
        positionAccess: input.positionAccess,
      }),
      spent: input.sppTotal - state.unspentSpp,
    });
    if (search.kind !== 'unique') {
      return { reason: SEARCH_REASONS[search.kind] };
    }
    return this.entry({
      input,
      steps: search.steps,
      profile,
      unspentSpp: state.unspentSpp,
    });
  }

  /** His total and position must equal the stored ones, and a stored unspent SPP the snapshot's. */
  private conflictsStored(
    input: SnapshotStageInput,
    state: TpRosterSnapshotVariant,
  ): boolean {
    const storedUnspent = input.candidate.unspentSpp;
    return (
      state.totalSpp !== input.sppTotal ||
      (storedUnspent !== null && storedUnspent !== state.unspentSpp) ||
      !input.positionTpIds.includes(String(state.lineUpMasterId))
    );
  }

  /** The checks that read no skill, giving his certain profile when all pass. */
  private gate(
    input: SnapshotStageInput,
    state: TpRosterSnapshotVariant,
  ): { profile: PositionProfile } | { reason: SkipReason } {
    if (state.unspentSpp < 0 || state.unspentSpp > input.sppTotal) {
      return { reason: 'spp-does-not-add-up' };
    }
    if (
      input.hasStatReduction &&
      this.proof.prove({
        reductions: input.reductions,
        competitions: input.competitions,
        rulesSetNames: input.rulesSetNames,
        diedAt: input.diedAt,
      }) === undefined
    ) {
      return { reason: 'lasting-injury-uncertain' };
    }
    if (input.freeSkillRisk) {
      return { reason: 'free-skill-risk' };
    }
    return input.profile === undefined
      ? { reason: 'position-ambiguous' }
      : { profile: input.profile };
  }

  /**
   * The snapshot's skills less the starting ones, each named; or why they
   * cannot be. Each starting skill must be shown exactly as often as his
   * position has it: shown more often, he would have gained a skill he
   * has; shown less often, the snapshot does not match his position.
   */
  private gained(
    resolved: readonly SnapshotSkill[],
    profile: PositionProfile,
  ): GainedSkill[] | SkipReason {
    const unmatched = new Map<number, number>();
    for (const skill of profile.skills) {
      unmatched.set(skill.skillId, (unmatched.get(skill.skillId) ?? 0) + 1);
    }
    const gained: SnapshotSkill[] = [];
    for (const skill of resolved) {
      const left = unmatched.get(skill.skillId);
      if (left === undefined) {
        gained.push(skill);
      } else if (left === 0) {
        return 'duplicate-skill';
      } else {
        unmatched.set(skill.skillId, left - 1);
      }
    }
    if ([...unmatched.values()].some((left) => left > 0)) {
      return 'snapshot-conflicts-stored';
    }
    if (new Set(gained.map((skill) => skill.skillId)).size !== gained.length) {
      return 'duplicate-skill';
    }
    return this.named(gained);
  }

  /** The gained skills with their one Name id each; or why one has none. */
  private named(gained: readonly SnapshotSkill[]): GainedSkill[] | SkipReason {
    const named: GainedSkill[] = [];
    for (const skill of gained) {
      if (
        skill.nameId === null ||
        skill.skillName === null ||
        skill.attributed
      ) {
        return 'skill-unresolved';
      }
      named.push({
        skillId: skill.skillId,
        skillName: skill.skillName,
        nameId: skill.nameId,
      });
    }
    return named.some((skill) => FREE_EXTRA_SKILL_NAMES.has(skill.skillName))
      ? 'free-skill-risk'
      : named;
  }

  /** His level counts his paid advancements, which must be exactly his gained skills. */
  private countReason(level: number, gained: number): SkipReason | undefined {
    if (level > gained) {
      return 'snapshot-characteristic-increase';
    }
    if (level < gained) {
      return 'snapshot-level-mismatch';
    }
    return gained > MAX_PAID_ADVANCEMENTS ? 'too-many-advancements' : undefined;
  }

  private entry(parts: {
    input: SnapshotStageInput;
    steps: SnapshotStep[];
    profile: PositionProfile;
    unspentSpp: number;
  }): StageDecision {
    const { input, steps, profile, unspentSpp } = parts;
    const outcome = this.replay.replay({
      line: profile.line,
      formats: profile.formats,
      events: this.reductions(input),
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
        advancements: steps.map((step) => ({
          skill: { system: 'Name', id: step.nameId },
          source: step.selection,
        })),
      }),
    };
  }

  private reductions(input: SnapshotStageInput): CharacteristicEvent[] {
    if (!input.hasStatReduction) {
      return [];
    }
    return input.reductions.map((row): CharacteristicEvent => ({
      kind: 'reduction',
      characteristic: row.characteristic,
      at: row.playedAt,
    }));
  }
}
