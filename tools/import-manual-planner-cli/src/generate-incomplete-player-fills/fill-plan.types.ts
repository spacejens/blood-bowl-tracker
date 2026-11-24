import type {
  AdvancementKind,
  CharacteristicFormat,
  NAME_EXTERNAL_SYSTEM_NAME,
  PlayerCharacteristic,
  PlayerStatus,
  SkillAccess,
  SkillCategory,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/domain-enums';

import type {
  TpFeedHistoryReport,
  TpFeedHistoryReports,
} from '../read-tp-feed-history/tp-feed-history-index.service';
import type { TpRosterSnapshots } from '../read-tp-roster-snapshots/tp-roster-snapshots.schema';
import type { CharacteristicKey } from './characteristic-keys';
import type { TpPositionIdRow, TpSkillIdRow } from './snapshot-fill.types';

export {
  CHARACTERISTIC_KEYS,
  type CharacteristicKey,
} from './characteristic-keys';

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

/** One rules set of an era, whether lasting injuries never heal under it, and its cheapest advancement; null when it prices none. */
export interface EraRulesSetRow {
  eraId: number;
  rulesSetId: number;
  lastingInjuriesNeverHeal: boolean;
  cheapestCost: number | null;
}

/** A competition the generator treats as ongoing, with how many teams it holds. */
export interface OngoingCompetitionSummary {
  competitionId: number;
  name: string;
  /** Distinct teams enrolled in it or playing one of its matches. */
  teamCount: number;
}

export interface FillPlannerRows {
  candidates: CandidateRow[];
  /** Candidates named as recipient of any stat-reduction match event. */
  statReductionPlayerIds: number[];
  /** Candidates named as recipient of a death match event. */
  deathPlayerIds: number[];
  /** When each candidate with a death match event died. */
  deathTimes: DeathTimeRow[];
  storedAdvancements: StoredAdvancementRow[];
  freeSkillRiskPlayerIds: number[];
  /** Teams of the ongoing competitions; their players are skipped. */
  ongoingTeamIds: number[];
  /** The competitions treated as ongoing, for the report; the planner does not read it. */
  ongoingCompetitions: OngoingCompetitionSummary[];
  positionRulesSets: PositionRulesSetRow[];
  positionSkills: PositionSkillRow[];
  /** Rules sets and cheapest costs of the team players' eras; the candidates' eras are among them. */
  eraRulesSets: EraRulesSetRow[];
  /** Every non-star TP player of a candidate's team. */
  teamPlayers: TeamPlayerRow[];
  /** The roster ids of the candidates' teams. */
  teamRosters: TeamRosterRow[];
  /** The stored paid advancements of every team player. */
  paidAdvancements: PaidAdvancementRow[];
  skillNames: SkillNameRow[];
  /** Skill categories under the team players' eras' rules sets; the candidates' are among them. */
  skillCategories: SkillCategoryRow[];
  /** Category access of the team players' positions; the candidates' positions are among them. */
  positionAccess: PositionAccessRow[];
  /** Advancement costs of the team players' eras; the candidates' eras are among them. */
  advancementCosts: AdvancementCostRow[];
  statReductionEvents: StatReductionEventRow[];
  /** Only for candidates with a stat reduction. */
  teamCompetitions: TeamCompetitionRow[];
  /** Candidate positions that are not basic in the candidate's era. */
  bigGuyPositions: BigGuyPositionRow[];
  /** Every skill's `tourplay.net` ids, which roster snapshots name it by. */
  tpSkillIds: TpSkillIdRow[];
  /** The `tourplay.net` ids of the candidates' positions. */
  tpPositionIds: TpPositionIdRow[];
  /** Skills a player or a position holds with a variant; a snapshot names none. */
  attributedSkillIds: number[];
}

export interface FillPlannerInput extends FillPlannerRows {
  /** The feed channel's saved `reports.json`; null leaves the advancement stage off. */
  feed: TpFeedHistoryReports | null;
  /** The saved roster snapshots; null leaves the snapshot stage off. */
  snapshots: TpRosterSnapshots | null;
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
  'snapshot-missing',
  'snapshot-disagrees',
  'snapshot-conflicts-stored',
  'snapshot-level-mismatch',
  'snapshot-characteristic-increase',
  'snapshot-order-ambiguous',
  'snapshot-spend-mismatch',
  'free-skill-risk',
  'lasting-injury-uncertain',
  'unspent-spp-missing',
  'too-many-advancements',
  'skill-unresolved',
  'duplicate-skill',
  'skill-category-mismatch',
  'rules-sets-disagree',
  'spp-does-not-add-up',
  'feed-cost-mismatch',
  'position-ambiguous',
  'characteristic-order-uncertain',
  'invalid-characteristics',
  'stored-data-contradicts',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface NameRef {
  system: typeof NAME_EXTERNAL_SYSTEM_NAME;
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
  player: { system: typeof TP_EXTERNAL_SYSTEM_NAME; id: string };
  /** A journeyman whose stored marker is set; his Loner is left to the server. */
  journeyman?: true;
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

/** One `lastingInjuryRepairs` entry, as the batch file holds it. */
export interface LastingInjuryRepairEntry {
  player: { system: typeof TP_EXTERNAL_SYSTEM_NAME; id: string };
}

/**
 * The rules set the server compares a stored player against: the formats
 * of his era's last-listed rules set with a row for his position, and that
 * row's start line, or, when no rules set of the era has one, the formats of
 * the last-listed rules set and no start line.
 */
export interface RepairRulesSetContext {
  formats: CharacteristicFormats;
  baseline: CharacteristicLine | null;
}

/**
 * A complete, non-star TP player with a stat reduction recorded in a match
 * and none stored, with what the server derives his reductions from.
 */
export interface LastingInjuryRepairCandidate extends LastingInjuryRepairEntry {
  line: CharacteristicLine;
  /** One element per active characteristic increase he has. */
  increases: CharacteristicKey[];
  /** Null when his era lists no rules set. */
  context: RepairRulesSetContext | null;
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
  /** Players filled as journeymen (`journeyman: true`), also counted under `noAdvancement`. */
  journeymenFilled: number;
  /** How the feed's player keys matched; null without feed evidence. */
  feed: FeedSummary | null;
  skipped: Record<SkipReason, SkipTally>;
}

export interface FillPlan {
  entries: FillEntry[];
  report: FillReport;
}

/** The skill a journeyman holds as a starting skill while he stays one. */
export const LONER_SKILL_NAME = 'Loner';

/** A candidate's position that carries the Big Guy keyword under a rules set of his era. */
export interface BigGuyPositionRow {
  positionId: number;
  eraId: number;
}

/** Skills the server's free-extra rules make free when gained outside the paid advancements. */
export const FREE_EXTRA_SKILL_NAMES: ReadonlySet<string> = new Set([
  LONER_SKILL_NAME,
  'Hatred',
]);

/** How many reductions each characteristic has suffered. */
export type ReductionCounts = Record<CharacteristicKey, number>;

export type CharacteristicEventKind = 'increase' | 'reduction';

/**
 * One change to a characteristic: an increase, at the time its feed report
 * was posted, or a proven stat reduction, at the time its match was played.
 */
export interface CharacteristicEvent {
  kind: CharacteristicEventKind;
  characteristic: CharacteristicKey;
  /** When it happened, as an ISO timestamp. */
  at: string;
}

/** The line a replay of characteristic events gives, or why it gives none. */
export type ReplayOutcome =
  | { kind: 'replayed'; line: CharacteristicLine }
  | { kind: 'unapplicable' }
  | { kind: 'order-uncertain' };

/** A non-star TP player of a candidate's team, complete or not, for matching feed reports. */
export interface TeamPlayerRow {
  playerId: number;
  teamId: number;
  eraId: number;
  positionId: number;
  playerName: string;
  positionName: string;
  sppTotal: number | null;
  unspentSpp: number | null;
  isJourneyman: boolean;
  /** Whether he is incomplete: one the generator fills, his stored data partial. */
  isIncomplete: boolean;
}

/**
 * One stored paid advancement of a team player: a gained skill with its
 * variant (`characteristic` null), or a characteristic increase (`skillId`
 * null). Not removed, not starting, not a free extra.
 */
export interface PaidAdvancementRow {
  playerId: number;
  skillId: number | null;
  attributeValue: string | null;
  characteristic: CharacteristicKey | null;
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

/** A competition a candidate's team era played in, with its first and last match. */
export interface TeamCompetitionRow {
  playerId: number;
  competitionId: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
}

/** The earliest match recording a candidate's death. */
export interface DeathTimeRow {
  playerId: number;
  /** When that match was played, as an ISO timestamp. */
  diedAt: string;
}

/** What the feed says of one stored player. */
export type FeedMatch =
  { kind: 'reports'; reports: TpFeedHistoryReport[] } | { kind: 'ambiguous' };

/** How the feed's player keys matched the stored players. */
export interface FeedSummary {
  reportKeys: number;
  /** Keys whose reports were given to stored players. */
  matchedKeys: number;
  /** Keys whose reports could belong to several players, or to someone not stored. */
  ambiguousKeys: number;
  /** Keys no stored TP player of a candidate's team can own any report of. */
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

/** What deciding whether a stored player owns a list of feed reports reads of him. */
export interface FeedOwner {
  playerId: number;
  sppTotal: number | null;
  unspentSpp: number | null;
  /** One entry per rules set of his era, for his position. */
  rulesSets: RulesSetPricingInput[];
  /** His stored paid advancements; empty when none are stored. */
  paid: PaidAdvancementRow[];
  /** Whether he is incomplete, so his stored paid advancements may be partial. */
  isIncomplete: boolean;
}

/**
 * Whether a player can own a list of reports; `unknown` when a check cannot
 * be decided, including when the feed may lack a report: a later one when the
 * reports cost less than the SPP he spent, an earlier one when a shown cost is
 * above its price.
 */
export type FeedFit = 'valid' | 'invalid' | 'unknown';

/** The rows deciding whether a stored player can own a list of feed reports. */
export type FeedPricingRows = Pick<
  FillPlannerRows,
  | 'paidAdvancements'
  | 'skillNames'
  | 'eraRulesSets'
  | 'advancementCosts'
  | 'skillCategories'
  | 'positionAccess'
>;

/** A stage's verdict on one candidate. */
export type StageDecision = { entry: FillEntry } | { reason: SkipReason };

/** Which kind of proof filled a player. */
export type FillStage =
  | 'noAdvancement'
  | 'advancement'
  | 'injuryOnly'
  | 'snapshot'
  | 'feedWithSnapshot';
