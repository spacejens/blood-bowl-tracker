import type {
  TpOfficialPosition,
  TpOfficialRace,
} from '@blood-bowl-tracker/parse-tp';

import type { TpOfficialPositionSlot } from './tp-official-positions-upsert.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

export const TP_SYSTEM_ID = 1;
export const NAME_SYSTEM_ID = 2;
export const RULES_SET_ID = 20;
export const ERA_IDS = [40, 41];

export const CHARACTERISTICS = {
  move: 5,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

export function officialTeamsContext(
  overrides: Partial<TpOfficialTeamsContext> = {},
): TpOfficialTeamsContext {
  return {
    tpSystemId: TP_SYSTEM_ID,
    nameSystemId: NAME_SYSTEM_ID,
    rulesSet: 'BB2020',
    rulesSetId: RULES_SET_ID,
    eraIds: ERA_IDS,
    ...overrides,
  };
}

export function officialPosition(
  overrides: Partial<TpOfficialPosition> = {},
): TpOfficialPosition {
  return {
    name: 'Blitzer',
    isStarPlayer: false,
    tpPositionId: 77,
    characteristics: CHARACTERISTICS,
    skills: [],
    keywordCodes: [],
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

export function positionSlot(
  overrides: Partial<TpOfficialPositionSlot> = {},
): TpOfficialPositionSlot {
  return {
    positionId: 9,
    name: 'Blitzer',
    characteristics: CHARACTERISTICS,
    skills: [],
    keywordCodes: [],
    ...overrides,
  };
}
