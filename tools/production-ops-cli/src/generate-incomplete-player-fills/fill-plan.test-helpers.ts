import type { TpFeedHistoryReport } from '../read-tp-feed-history/tp-feed-history-index.service';
import type {
  CandidateRow,
  FillPlannerInput,
  PositionProfile,
  TeamPlayerRow,
} from './fill-plan.types';

/** A chosen primary Dodge for #13 Flame (Gnoblar Lineman) of roster 24801, at 6. */
export function report(
  overrides: Partial<TpFeedHistoryReport> = {},
): TpFeedHistoryReport {
  return {
    messageId: '1057968552151359499',
    link: 'https://discord.com/channels/1/2/1057968552151359499',
    timestamp: '2022-12-29T10:29:18.938000+00:00',
    teamName: 'Firestarters',
    playerNumber: '13',
    playerName: 'Flame',
    position: 'Gnoblar Lineman',
    botReacted: false,
    rosterLink: 'https://tourplay.net/en/blood-bowl/roster/24801',
    selection: 'chosen',
    category: 'primary',
    gain: { skill: 'Dodge' },
    sppCost: 6,
    valueText: 'Primary Dodge ★6',
    rawValue: 'Primary ` Dodge ` ` ★6 `',
    ...overrides,
  };
}

/** Flame (Gnoblar Lineman, team 20, era 4, position 30): a TP player with 20 SPP, 2 unspent. */
export function teamPlayer(
  overrides: Partial<TeamPlayerRow> = {},
): TeamPlayerRow {
  return {
    playerId: 1,
    teamId: 20,
    eraId: 4,
    positionId: 30,
    playerName: 'Flame',
    positionName: 'Gnoblar Lineman',
    sppTotal: 20,
    unspentSpp: 2,
    isJourneyman: false,
    ...overrides,
  };
}

/** An incomplete TP player who is eligible under `eligibleInput()`. */
export function candidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    playerId: 1,
    tpId: '500',
    teamId: 20,
    positionId: 30,
    eraId: 4,
    sppTotal: 5,
    unspentSpp: null,
    status: null,
    isJourneyman: false,
    move: 0,
    strength: 0,
    agility: 0,
    passing: null,
    armour: 0,
    ...overrides,
  };
}

/** Planner input under which `candidate()` is filled as retired. */
export function eligibleInput(
  overrides: Partial<FillPlannerInput> = {},
): FillPlannerInput {
  return {
    candidates: [candidate()],
    statReductionPlayerIds: [],
    deathPlayerIds: [],
    storedAdvancements: [],
    freeSkillRiskPlayerIds: [],
    ongoingTeamIds: [],
    positionRulesSets: [
      {
        positionRulesSetId: 40,
        positionId: 30,
        eraId: 4,
        rulesSetId: 7,
        line: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
        formats: {
          ma: 'bare',
          st: 'bare',
          ag: 'plus',
          pa: 'plus_zero_legal',
          av: 'plus',
        },
      },
    ],
    positionSkills: [
      {
        positionRulesSetId: 40,
        skillId: 100,
        nameId: 'Block',
        attributeValue: null,
      },
    ],
    eraRulesSets: [{ eraId: 4, rulesSetId: 7, cheapestCost: 6 }],
    teamPlayers: [],
    teamRosters: [],
    paidAdvancements: [],
    skillNames: [],
    skillCategories: [],
    positionAccess: [],
    advancementCosts: [],
    statReductionEvents: [],
    teamCompetitions: [],
    bigGuyPositions: [],
    feed: null,
    ...overrides,
  };
}

/** The profile the mocked PositionProfileService returns by default. */
export function profile(
  overrides: Partial<PositionProfile> = {},
): PositionProfile {
  return {
    line: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
    formats: {
      ma: 'bare',
      st: 'bare',
      ag: 'plus',
      pa: 'plus_zero_legal',
      av: 'plus',
    },
    skills: [{ skillId: 100, nameId: 'Block', attributeValue: null }],
    ...overrides,
  };
}
