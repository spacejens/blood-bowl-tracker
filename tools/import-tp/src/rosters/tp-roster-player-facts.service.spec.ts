import type {
  TpCareerSppCounts,
  TpPlayerSkills,
  TpRoster,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { RosterEntry } from '../source/roster-collection.service';
import { TpRosterPlayerFactsService } from './tp-roster-player-facts.service';

/** A minimal roster player, distinguishable by lineUp id. */
function player(overrides: Partial<TpRosterPlayer> = {}): TpRosterPlayer {
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

/** A minimal roster file entry carrying the given players. */
function entry(players: TpRosterPlayer[], rosterId = 163386): RosterEntry {
  const roster: TpRoster = {
    id: rosterId,
    teamName: `Team ${rosterId}`,
    teamRaceCode: 'Orc',
    raceName: 'Orc',
    coachTpId: 'coach-1',
    coachName: 'Coach 1',
    positions: [],
    starPositions: [],
    players,
  };
  return { roster, era: 'Fourth era', competition: 'comp', content: {} };
}

const SKILLS: TpPlayerSkills = {
  starting: [{ skillMasterId: 87 }],
  gained: [{ skillMasterId: 220, isRandom: false }],
};

const OTHER_SKILLS: TpPlayerSkills = {
  starting: [{ skillMasterId: 99 }],
  gained: [],
};

function careerCounts(
  overrides: Partial<TpCareerSppCounts> = {},
): TpCareerSppCounts {
  return {
    touchdowns: 1,
    completions: 2,
    interceptions: 3,
    mvpAwards: 4,
    casualties: 5,
    ...overrides,
  };
}

describe('TpRosterPlayerFactsService', () => {
  let service: TpRosterPlayerFactsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRosterPlayerFactsService],
    }).compile();
    service = moduleRef.get(TpRosterPlayerFactsService);
  });

  it("accumulates every imported roster player's skill group by database id", () => {
    const { skillsByPlayerId } = service.collect({
      rosters: [
        entry([
          player({ id: 5001, skills: SKILLS }),
          player({ id: 5002, skills: OTHER_SKILLS }),
        ]),
      ],
      playerIdsByLineUpId: new Map([
        [5001, 700],
        [5002, 701],
      ]),
    });

    expect(skillsByPlayerId).toEqual(
      new Map([
        [700, SKILLS],
        [701, OTHER_SKILLS],
      ]),
    );
  });

  it('records nothing for a player that was not imported', () => {
    const { skillsByPlayerId } = service.collect({
      rosters: [entry([player({ id: 5001, skills: SKILLS })])],
      playerIdsByLineUpId: new Map(),
    });

    expect(skillsByPlayerId.size).toBe(0);
  });

  it('the last roster listing a player wins for skills', () => {
    const { skillsByPlayerId } = service.collect({
      rosters: [
        entry([player({ id: 5001, skills: SKILLS })]),
        entry([player({ id: 5001, skills: OTHER_SKILLS })]),
      ],
      playerIdsByLineUpId: new Map([[5001, 700]]),
    });

    expect(skillsByPlayerId.get(700)).toEqual(OTHER_SKILLS);
  });

  it("returns the roster players' career counts keyed by DB player id", () => {
    const { careerSppCountsByPlayerId } = service.collect({
      rosters: [
        entry([
          player({
            id: 5001,
            careerCounts: {
              touchdowns: 1,
              completions: 2,
              interceptions: 3,
              mvpAwards: 4,
              casualties: 5,
            },
          }),
        ]),
      ],
      playerIdsByLineUpId: new Map([[5001, 700]]),
    });

    expect(careerSppCountsByPlayerId.get(700)).toEqual({
      touchdown: 1,
      completion: 2,
      interception: 3,
      mvp_award: 4,
      casualty: 5,
    });
  });

  it('omits a player whose source entry carried no career counts', () => {
    const { careerSppCountsByPlayerId } = service.collect({
      rosters: [entry([player({ id: 5001 })])],
      playerIdsByLineUpId: new Map([[5001, 700]]),
    });

    expect(careerSppCountsByPlayerId.size).toBe(0);
  });

  it('keeps the highest count seen per group across roster files', () => {
    const { careerSppCountsByPlayerId } = service.collect({
      rosters: [
        entry([
          player({
            id: 5001,
            careerCounts: careerCounts({ touchdowns: 5, completions: 1 }),
          }),
        ]),
        entry([
          player({
            id: 5001,
            careerCounts: careerCounts({ touchdowns: 2, completions: 9 }),
          }),
        ]),
      ],
      playerIdsByLineUpId: new Map([[5001, 700]]),
    });

    expect(careerSppCountsByPlayerId.get(700)).toEqual({
      touchdown: 5,
      completion: 9,
      interception: 3,
      mvp_award: 4,
      casualty: 5,
    });
  });
});
