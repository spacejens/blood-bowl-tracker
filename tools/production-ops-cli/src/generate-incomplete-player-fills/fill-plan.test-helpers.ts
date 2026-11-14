import type {
  CandidateRow,
  FillPlannerInput,
  PositionProfile,
} from './fill-plan.types';

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
    consequenceCounts: [],
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
