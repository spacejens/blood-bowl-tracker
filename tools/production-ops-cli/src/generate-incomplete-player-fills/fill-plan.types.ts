import type {
  AdvancementKind,
  CharacteristicFormat,
  PlayerCharacteristic,
  PlayerStatus,
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';

import type {
  TpFeedHistoryReport,
  TpFeedHistoryReports,
} from '../read-tp-feed-history/tp-feed-history-index.service';

/** The five characteristics, by the keys a fill entry uses. */
export const CHARACTERISTIC_KEYS = ['ma', 'st', 'ag', 'pa', 'av'] as const;
export type CharacteristicKey = (typeof CHARACTERISTIC_KEYS)[number];

/** A characteristic line; `pa` is null exactly when the rules set has no Passing. */
export interface CharacteristicLine {
  ma: number;
  st: number;
  ag: number;
  pa: number | null;
  av: number;
}

export type CharacteristicFormats = Record<
  CharacteristicKey,
  CharacteristicFormat
>;

/** An incomplete, non-star TP player, as stored. */
export interface CandidateRow {
  playerId: number;
  tpId: string;
  teamId: number;
  positionId: number;
  eraId: number;
  sppTotal: number | null;
  unspentSpp: number | null;
  status: PlayerStatus | null;
  isJourneyman: boolean;
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/** One stored, non-removed advancement row of a candidate. */
export interface StoredAdvancementRow {
  playerId: number;
  source: string;
  skillId: number | null;
  skillName: string | null;
  attributeValue: string | null;
  isFreeExtra: boolean;
}

/** A position's characteristics under one rules set of one era. */
export interface PositionRulesSetRow {
  positionRulesSetId: number;
  positionId: number;
  eraId: number;
  rulesSetId: number;
  line: CharacteristicLine;
  formats: CharacteristicFormats;
}

/** One starting skill of a position-rules-set row; `nameId` is its Name-system id. */
export interface PositionSkillRow {
  positionRulesSetId: number;
  skillId: number;
  nameId: string | null;
  attributeValue: string | null;
}

/** One rules set of an era and its cheapest advancement; null when it prices none. */
export interface EraRulesSetRow {
  eraId: number;
  rulesSetId: number;
  cheapestCost: number | null;
}

export interface FillPlannerRows {
  candidates: CandidateRow[];
  /** Candidates named as recipient of any stat-reduction match event. */
  statReductionPlayerIds: number[];
  /** Candidates named as recipient of a death match event. */
  deathPlayerIds: number[];
  storedAdvancements: StoredAdvancementRow[];
  freeSkillRiskPlayerIds: number[];
  ongoingTeamIds: number[];
  positionRulesSets: PositionRulesSetRow[];
  positionSkills: PositionSkillRow[];
  eraRulesSets: EraRulesSetRow[];
  /** Every non-star player of a candidate's team. */
  teamPlayers: TeamPlayerRow[];
  /** The roster ids of the candidates' teams. */
  teamRosters: TeamRosterRow[];
  skillNames: SkillNameRow[];
  skillCategories: SkillCategoryRow[];
  positionAccess: PositionAccessRow[];
  advancementCosts: AdvancementCostRow[];
  statReductionEvents: StatReductionEventRow[];
  /** Only for candidates with a stat reduction. */
  teamCompetitions: TeamCompetitionRow[];
}

export interface FillPlannerInput extends FillPlannerRows {
  /** The feed channel's saved `reports.json`; null leaves the advancement stage off. */
  feed: TpFeedHistoryReports | null;
}

export interface ProfileSkill {
  skillId: number;
  nameId: string;
  attributeValue: string | null;
}

/** A position's one certain line, formats and starting skills in an era. */
export interface PositionProfile {
  line: CharacteristicLine;
  formats: CharacteristicFormats;
  skills: ProfileSkill[];
}

export const SKIP_REASONS = [
  'journeyman',
  'team-in-ongoing-competition',
  'spp-missing',
  'era-unpriced',
  'feed-match-ambiguous',
  'spp-too-high',
  'free-skill-risk',
  'lasting-injury-uncertain',
  'advancement-and-injury',
  'unspent-spp-missing',
  'too-many-advancements',
  'skill-unresolved',
  'duplicate-skill',
  'skill-category-mismatch',
  'rules-sets-disagree',
  'spp-does-not-add-up',
  'feed-cost-mismatch',
  'position-ambiguous',
  'invalid-characteristics',
  'stored-data-contradicts',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface NameRef {
  system: 'Name';
  id: string;
}

export type FillStartingSkill =
  NameRef | { skill: NameRef; attributeValue: string };

/** One advancement of a fill entry: a reported skill, or a characteristic increase. */
export type FillAdvancement =
  | { skill: NameRef; attributeValue?: string; source: FeedSelection }
  | { characteristic: PlayerCharacteristic };

/** One `incompletePlayerFills` entry, as the batch file holds it. */
export interface FillEntry {
  player: { system: 'tourplay.net'; id: string };
  status: PlayerStatus;
  characteristics: {
    ma: number;
    st: number;
    ag: number;
    pa?: number;
    av: number;
  };
  sppTotal: number;
  unspentSpp: number;
  startingSkills: FillStartingSkill[];
  advancements: FillAdvancement[];
}

export interface SkipTally {
  count: number;
  /** TP external ids, in the order the players were considered. */
  players: string[];
}

export interface FillReport {
  considered: number;
  eligible: number;
  /** Players filled, by the kind of proof. */
  eligibleByStage: Record<FillStage, number>;
  /** How the feed's player keys matched; null without feed evidence. */
  feed: FeedSummary | null;
  skipped: Record<SkipReason, SkipTally>;
}

export interface FillPlan {
  entries: FillEntry[];
  report: FillReport;
}

/** Skills the server's free-extra rules make free when gained outside the paid advancements. */
export const FREE_EXTRA_SKILL_NAMES: ReadonlySet<string> = new Set([
  'Loner',
  'Hatred',
]);

/** How many reductions each characteristic has suffered. */
export type ReductionCounts = Record<CharacteristicKey, number>;

/** A non-star player of a candidate's team, for matching feed reports. */
export interface TeamPlayerRow {
  playerId: number;
  teamId: number;
  playerName: string;
  positionName: string;
}

/** A team's TP roster id: its `tourplay.net` external id. */
export interface TeamRosterRow {
  teamId: number;
  rosterId: string;
}

/** One `Name`-system id of a skill, with the skill's stored name. */
export interface SkillNameRow {
  skillId: number;
  skillName: string;
  nameId: string;
}

/** A skill's category under one rules set of a candidate's era. */
export interface SkillCategoryRow {
  skillId: number;
  rulesSetId: number;
  category: SkillCategory;
}

/** A position's access to one skill category under one rules set. */
export interface PositionAccessRow {
  positionId: number;
  rulesSetId: number;
  category: SkillCategory;
  access: SkillAccess;
}

/**
 * One `advancement_costs` row that applies to a candidate's era: a rules
 * set's own row (no league) or a row of the era's league.
 */
export interface AdvancementCostRow {
  eraId: number;
  rulesSetId: number;
  leagueId: number | null;
  advancementNumber: number;
  advancementKind: AdvancementKind;
  skillId: number | null;
  sppCost: number;
}

/** One stat-reduction match event of a candidate. */
export interface StatReductionEventRow {
  playerId: number;
  characteristic: CharacteristicKey;
  competitionId: number;
  /** When the match was played, as an ISO timestamp. */
  playedAt: string;
}

/** A competition a candidate's team era played in, with its last match. */
export interface TeamCompetitionRow {
  playerId: number;
  competitionId: number;
  lastPlayedAt: string;
}

/** What the feed says of one stored player. */
export type FeedMatch =
  { kind: 'reports'; reports: TpFeedHistoryReport[] } | { kind: 'ambiguous' };

/** How the feed's player keys matched the stored players. */
export interface FeedSummary {
  reportKeys: number;
  /** Keys naming exactly one stored player. */
  matchedKeys: number;
  /** Keys naming several stored players, or with several roster links. */
  ambiguousKeys: number;
  /** Keys naming no player of a candidate's team. */
  unmatchedKeys: number;
}

export interface FeedMatchResult {
  byPlayer: Map<number, FeedMatch>;
  summary: FeedSummary;
}

export type FeedSelection = 'chosen' | 'random';

/** One feed report, its skill resolved to a stored skill. */
export type ResolvedStep =
  | {
      kind: 'skill';
      skillId: number;
      skillName: string;
      nameId: string;
      attributeValue: string | null;
      selection: FeedSelection;
      category: 'primary' | 'secondary';
      reportedCost: number;
    }
  | {
      kind: 'characteristic';
      characteristic: CharacteristicKey;
      selection: FeedSelection;
      reportedCost: number;
    };

/** What pricing reads about one rules set of a candidate's era. */
export interface RulesSetPricingInput {
  rulesSetId: number;
  costs: readonly AdvancementCostRow[];
  /** Skill id -> its category under this rules set. */
  skillCategories: ReadonlyMap<number, SkillCategory>;
  /** The position's access to each category under this rules set. */
  positionAccess: ReadonlyMap<SkillCategory, SkillAccess>;
}

export type PricingOutcome =
  | { kind: 'priced'; stepCosts: number[]; total: number }
  | { kind: 'granted-skill' }
  | { kind: 'category-mismatch' }
  | { kind: 'disagree' }
  | { kind: 'unpriced' };

/** A stage's verdict on one candidate. */
export type StageDecision = { entry: FillEntry } | { reason: SkipReason };

/** Which kind of proof filled a player. */
export type FillStage = 'noAdvancement' | 'advancement' | 'injuryOnly';
