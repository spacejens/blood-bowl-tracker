import type {
  AdvancementKind,
  PlayerCharacteristic,
  PlayerSkillSource,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';

/** One `advancement_costs` row that applies to a player. */
export interface ApplicableCost {
  advancementNumber: number;
  advancementKind: AdvancementKind;
  /** Set only on a `granted_skill` row: the skill it grants. */
  skillId: number | null;
  sppCost: number;
  /** Null on the rules set's own row; the league's id on a house rule. */
  leagueId: number | null;
}

/** One stored `player_advancements` row, as the cost check needs it. */
export interface StoredPlayerSkill {
  skillId: number;
  skillName: string;
  source: PlayerSkillSource;
  advancementOrder: number | null;
  /** True when the stored order is confirmed as the real sequence. */
  orderConfirmed: boolean;
  /** The stored free-extra flag: costs no SPP and takes no advancement number. */
  isFreeExtra: boolean;
  /** The skill's category under the player's rules set; null when unlisted. */
  category: SkillCategory | null;
}

/** One stored characteristic increase. */
export interface StoredIncrease {
  characteristic: PlayerCharacteristic;
  advancementOrder: number | null;
  orderConfirmed: boolean;
}

/** How a stored unspent SPP compares with the source's own unspent figure. */
export type StoredSourceComparison =
  'matches' | 'differs' | 'not_compared' | 'no_figure';

/** The stored `players.unspent_spp`, checked against the model and the source. */
export type StoredUnspentCheck =
  | { kind: 'none_stored' }
  | {
      kind: 'stored';
      stored: number;
      /** Against the modelled unspent range; null when no range is modelled. */
      placement: FigurePlacement | null;
      source: StoredSourceComparison;
      sourceUnspent: number | null;
    };

/** What the database holds about one player's advancements and their prices. */
export interface AdvancementHistory {
  playerId: number;
  sppTotal: number | null;
  /** The stored `players.unspent_spp`; null when not known exactly. */
  storedUnspentSpp: number | null;
  isStarPlayer: boolean;
  /** The era's last-listed rules set; null when the era lists none. */
  rulesSet: { id: number; name: string } | null;
  /** Starting skills first, then gained skills in stored order. */
  skills: StoredPlayerSkill[];
  /**
   * The categories the player's position has as primary and as secondary
   * under the rules set; both empty when none are recorded for the pair.
   */
  primaryCategories: ReadonlySet<SkillCategory>;
  secondaryCategories: ReadonlySet<SkillCategory>;
  /** The stored characteristic increases, not removed ones. */
  increases: StoredIncrease[];
  /** The rules set's own costs plus the player's league's house rules. */
  costs: ApplicableCost[];
}

/** Why a row costs what it does. */
export type AdvancementRowKind =
  'starting' | 'free_extra' | 'granted' | 'skill' | 'characteristic';

/** One cost an advancement could have had at its number. */
export interface CandidateCost {
  advancementKind: AdvancementKind;
  sppCost: number;
}

/** One row of the imported panel. */
export interface ModelledAdvancement {
  /** The skill's name, or `+MA`/`+ST`/`+AG`/`+PA`/`+AV`. */
  label: string;
  kind: AdvancementRowKind;
  /** The stored `player_advancements.source`; null for a characteristic increase. */
  storedSource: PlayerSkillSource | null;
  /** The number this row is priced at; null for a free row. */
  advancementNumber: number | null;
  /** Costs it could have had at that number; empty for a free row. */
  candidates: CandidateCost[];
  /**
   * Set on a characteristic row only: whether its stored order is known, and
   * whether that order is confirmed as the real sequence.
   */
  increaseOrder?: { known: boolean; confirmed: boolean };
  /**
   * Set on a gained skill row priced by number: true when its stored order
   * is confirmed, so the row sits at that number.
   */
  orderConfirmed?: boolean;
}

/** Why no range could be modelled, in the order they are checked. */
export type UnknownRangeReason =
  | 'star_player'
  | 'no_total_spp'
  | 'no_rules_set'
  | 'no_costs'
  | 'unpriced_advancement';

export interface ModelledRange {
  spentMin: number;
  spentMax: number;
  unspentMin: number;
  unspentMax: number;
}

export interface UnspentSppModel {
  rulesSetName: string | null;
  /** True when every one of the rules set's own costs is a `table_roll`. */
  fixedThresholds: boolean;
  rows: ModelledAdvancement[];
  totalSpp: number | null;
  /** Null exactly when `unknownReason` is set. */
  range: ModelledRange | null;
  unknownReason: UnknownRangeReason | null;
}

/** Where a source's reported spend lies against the modelled spend range. */
export type FigurePlacement = 'below' | 'inside' | 'above';

/**
 * The outcome of placing a source's own spend (its reported total minus its
 * reported unspent SPP) against the modelled spend range: `none` when either
 * source number or the range is missing, `not_compared` when the source's
 * figure is known but is not placed under this rules set, else `compared`.
 */
export type SpendComparison =
  | { kind: 'none' }
  | { kind: 'not_compared'; reportedSpend: number }
  | { kind: 'compared'; reportedSpend: number; placement: FigurePlacement };
