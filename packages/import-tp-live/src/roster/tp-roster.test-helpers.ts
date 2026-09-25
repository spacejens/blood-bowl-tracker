import type { RulesSet as DbRulesSet } from '@blood-bowl-tracker/db';
import type { TpRoster, TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';

import type { TpRosterContext } from './tp-roster-context.service';

export const TP_SYSTEM_ID = 1;
export const NAME_SYSTEM_ID = 2;
export const ERA_ID = 40;

// RulesSetsService.listByEra returns the db row type, which carries history-
// tracking columns the api-contract RulesSet TpRosterContext exposes does
// not; the mock must supply them to satisfy that return type, but every
// consumer of RULES_SET only reads the contract's narrower fields.
export const RULES_SET: DbRulesSet = {
  id: 900,
  name: 'BB2020',
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
  createdAt: new Date('2020-01-01'),
  updatedAt: new Date('2020-01-01'),
  historyVersion: 1,
  historyPeriod: '["2020-01-01 00:00:00+00",)',
};

/** A plain regular roster player with no optional groups. */
export function rosterPlayer(
  overrides: Partial<TpRosterPlayer> = {},
): TpRosterPlayer {
  return {
    id: 5001,
    name: 'Grim',
    number: 1,
    lineUpMasterId: 77,
    rosterId: 163386,
    fallbackPositionName: 'Lineman',
    isBigGuy: false,
    totalStarPlayerPoints: 12,
    ...overrides,
  };
}

export function tpRoster(overrides: Partial<TpRoster> = {}): TpRoster {
  return {
    id: 163386,
    teamName: 'Da Boyz',
    teamRaceCode: 'orc',
    raceName: 'Orc',
    coachTpId: 'c-42',
    coachName: 'Grimgor',
    positions: [],
    starPositions: [],
    players: [rosterPlayer()],
    ...overrides,
  };
}

export function rosterContext(
  overrides: Partial<TpRosterContext> = {},
): TpRosterContext {
  return {
    tpSystemId: TP_SYSTEM_ID,
    nameSystemId: NAME_SYSTEM_ID,
    era: { id: ERA_ID, name: 'Fourth era' },
    rulesSet: RULES_SET,
    ...overrides,
  };
}
