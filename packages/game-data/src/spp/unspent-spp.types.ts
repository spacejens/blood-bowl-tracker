import type {
  AdvancementKind,
  PlayerSkillSource,
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';

/**
 * One `advancement_costs` row that applies to a player under one rules set:
 * either the rules set's own row or one of the player's league's rows.
 */
export interface ApplicableAdvancementCost {
  advancementNumber: number;
  advancementKind: AdvancementKind;
  skillId: number | null;
  sppCost: number;
}

/**
 * One way a gained advancement could have been paid for. `advancementNumber`
 * is null when the advancement could have been any number, and set when only
 * one number fits (a skill a league's cost row grants).
 */
export interface AdvancementOption {
  advancementKind: AdvancementKind;
  advancementNumber: number | null;
}

/** One skill a player has, as the advancement rules read it. */
export interface PlayerSkillEntry {
  skillId: number;
  source: PlayerSkillSource;
}

/** What AdvancementKindCandidatesService needs for one player under one rules set. */
export interface AdvancementCandidatesInput {
  /** Every skill the player has, starting skills included. */
  skills: PlayerSkillEntry[];
  /** Skills one of the player's own trophy awards granted. */
  trophyGrantedSkillIds: ReadonlySet<number>;
  /** The sum of the player's five characteristic increase counts. */
  characteristicIncreases: number;
  /** Each skill's category under this rules set; a skill with none is absent. */
  skillCategories: ReadonlyMap<number, SkillCategory>;
  /**
   * The position's access to each category under this rules set; a category
   * the position has no access to is absent.
   */
  positionAccess: ReadonlyMap<SkillCategory, SkillAccess>;
  /** The cost rows that apply to the player under this rules set. */
  costs: ApplicableAdvancementCost[];
}

/** The least and most SPP a player's gained advancements can have cost. */
export interface SpendRange {
  spentMin: number;
  spentMax: number;
}

/** Why a player's unspent SPP cannot be worked out. */
export type UnspentSppUnknownReason =
  | 'no_total_spp'
  | 'no_rules_set'
  | 'no_costs'
  | 'star_player'
  | 'inconsistent_history';

/** Whether a player's unspent SPP covers the cheapest next advancement. */
export type CoversAnother = 'yes' | 'no' | 'maybe';

/** How a rules set prices advancements. */
export type PricingModel = 'fixed_threshold' | 'kind_priced';

/** What the stored `players.unspent_spp` did to the modelled range. */
export type StoredUnspentVerdict = 'settled' | 'outside_range' | 'none_stored';

/** A player's unspent SPP, as a range over what the history allows. */
export interface KnownUnspentSpp {
  status: 'known';
  totalSpp: number;
  advancementsGained: number;
  spentMin: number;
  spentMax: number;
  unspentMin: number;
  unspentMax: number;
  cheapestNextCost: number | null;
  coversAnother: CoversAnother;
  /**
   * `settled` when the stored figure lies inside the modelled range and the
   * range was narrowed to it, `outside_range` when it lies outside and the
   * range was kept, `none_stored` when nothing is stored or the figure was
   * not consulted.
   */
  storedVerdict: StoredUnspentVerdict;
  /**
   * The stored figure the verdict was reached against; null when none is
   * stored or the figure was not consulted.
   */
  storedUnspentSpp: number | null;
}

/** A player whose unspent SPP cannot be worked out, and why. */
export interface UnknownUnspentSpp {
  status: 'unknown';
  reason: UnspentSppUnknownReason;
}

export type UnspentSppResult = KnownUnspentSpp | UnknownUnspentSpp;

/** What one rules set's costs make of a player's history, when they fit. */
export interface FittingOutcome {
  kind: 'fits';
  advancementsGained: number;
  spentMin: number;
  spentMax: number;
  cheapestNextCost: number | null;
  coversAnother: CoversAnother;
}

/** What one rules set's costs make of a player's history. */
export type RulesSetOutcome =
  { kind: 'no_costs' } | { kind: 'inconsistent' } | FittingOutcome;

/** A modelled result with the pricing model of the player's era. */
export interface ModelledUnspentSpp {
  /** Null when the era's rules sets disagree or none has its own costs. */
  pricingModel: PricingModel | null;
  /** The range the history allows; the stored figure is not consulted. */
  result: UnspentSppResult;
}

/**
 * What one rules set of a player's era makes of their advancements: the cost
 * rows that apply to the player under it and the input
 * AdvancementKindCandidatesService reads, for working out what the
 * advancements were.
 */
export interface RulesSetAdvancementInput {
  rulesSetId: number;
  /** How this rules set alone prices advancements; null with no own rows. */
  pricingModel: PricingModel | null;
  costs: ApplicableAdvancementCost[];
  candidatesInput: AdvancementCandidatesInput;
}
