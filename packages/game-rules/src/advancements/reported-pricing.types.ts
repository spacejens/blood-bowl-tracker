import type {
  AdvancementKind,
  PlayerSkillSource,
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';

/** How a reported advancement was selected: chosen by the coach or rolled. */
export type ReportedSelection = Extract<PlayerSkillSource, 'chosen' | 'random'>;

/** One reported skill advancement, its skill resolved to a stored skill. */
export interface ReportedSkillStep {
  kind: 'skill';
  skillId: number;
  selection: ReportedSelection;
  category: SkillAccess;
}

/** One reported characteristic increase. */
export interface ReportedCharacteristicStep {
  kind: 'characteristic';
  selection: ReportedSelection;
}

export type ReportedStep = ReportedSkillStep | ReportedCharacteristicStep;

/**
 * One `advancement_costs` row that applies to a player's era: a rules
 * set's own row (no league) or a row of the era's league.
 */
export interface PricingCostRow {
  leagueId: number | null;
  advancementNumber: number;
  advancementKind: AdvancementKind;
  skillId: number | null;
  sppCost: number;
}

/** What pricing reads about one rules set of a player's era. */
export interface RulesSetPricingInput {
  rulesSetId: number;
  costs: readonly PricingCostRow[];
  /** Skill id -> its category under this rules set. */
  skillCategories: ReadonlyMap<number, SkillCategory>;
  /** The position's access to each category under this rules set. */
  positionAccess: ReadonlyMap<SkillCategory, SkillAccess>;
}

export interface ReportedPricingInput {
  /** The player's advancements, first taken first. */
  steps: readonly ReportedStep[];
  /** One entry per rules set of the player's era. */
  rulesSets: readonly RulesSetPricingInput[];
}

export type PricingOutcome =
  | { kind: 'priced'; stepCosts: number[]; total: number }
  | { kind: 'granted-skill' }
  | { kind: 'category-mismatch' }
  | { kind: 'disagree' }
  | { kind: 'unpriced' };
