import type {
  TpOfficialPosition,
  TpOfficialRace,
} from '@blood-bowl-tracker/api-contract';

export const STATS = {
  move: 5,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

export function officialPosition(
  overrides: Partial<TpOfficialPosition> = {},
): TpOfficialPosition {
  return {
    name: 'Blitzer',
    isStarPlayer: false,
    tpPositionId: 77,
    characteristics: STATS,
    skills: [],
    keywordCodes: [],
    skillCategories: { primary: [], secondary: [] },
    ...overrides,
  };
}

export function officialRace(
  overrides: Partial<TpOfficialRace> = {},
): TpOfficialRace {
  return {
    name: 'Orc',
    teamRaceCode: 'orc20',
    isOfficial: true,
    positions: [officialPosition()],
    ...overrides,
  };
}

/** `count` distinct regular positions, for sizing a race. */
export function racePositions(count: number): TpOfficialPosition[] {
  return Array.from({ length: count }, (_, index) =>
    officialPosition({ name: `Position ${index}`, tpPositionId: index }),
  );
}
