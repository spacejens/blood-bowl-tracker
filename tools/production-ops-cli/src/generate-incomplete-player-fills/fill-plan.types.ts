import type {
  CharacteristicFormat,
  PlayerStatus,
} from '@blood-bowl-tracker/domain-enums';

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

export interface FillPlannerInput {
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
  'spp-missing',
  'era-unpriced',
  'spp-too-high',
  'free-skill-risk',
  'lasting-injury-uncertain',
  'position-ambiguous',
  'invalid-characteristics',
  'stored-data-contradicts',
  'status-unresolved',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface NameRef {
  system: 'Name';
  id: string;
}

export type FillStartingSkill =
  NameRef | { skill: NameRef; attributeValue: string };

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
  advancements: [];
}

export interface SkipTally {
  count: number;
  /** TP external ids, in the order the players were considered. */
  players: string[];
}

export interface FillReport {
  considered: number;
  eligible: number;
  skipped: Record<SkipReason, SkipTally>;
}

export interface FillPlan {
  entries: FillEntry[];
  report: FillReport;
}
