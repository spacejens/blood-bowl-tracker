import { JourneymanRuleService } from '@blood-bowl-tracker/import-shared';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { rosterPlayer, tpRoster } from '../tp-roster.test-helpers';
import type { TpJourneymanDecideOptions } from './tp-journeyman.service';
import { TpJourneymanService } from './tp-journeyman.service';
import type { ResolvedPlayerPosition } from './tp-player-position.service';

const LONER_MASTER_ID = 11;
const BASIC_POSITION: ResolvedPlayerPosition = {
  positionId: 31,
  mercenary: undefined,
};

/** A roster entry named Journeyman with the given gained skill master ids. */
function journeyman(
  gainedMasterIds: number[],
  overrides: Partial<TpRosterPlayer> = {},
): TpRosterPlayer {
  return rosterPlayer({
    name: 'Journeyman',
    skills: {
      starting: [],
      gained: gainedMasterIds.map((skillMasterId) => ({
        skillMasterId,
        isRandom: false,
        isExtra: false,
      })),
    },
    ...overrides,
  });
}

describe('TpJourneymanService', () => {
  let service: TpJourneymanService;
  let parser: MockProxy<SkillMasterNamesParserService>;

  beforeEach(async () => {
    parser = mock<SkillMasterNamesParserService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpJourneymanService,
        // Pure, dependency-free decision logic, passed real.
        JourneymanRuleService,
        { provide: SkillMasterNamesParserService, useValue: parser },
      ],
    }).compile();
    service = moduleRef.get(TpJourneymanService);
  });

  const decide = (overrides: Partial<TpJourneymanDecideOptions>) =>
    service.decide({
      player: journeyman([LONER_MASTER_ID]),
      position: BASIC_POSITION,
      roster: tpRoster(),
      isRosterEntry: true,
      lonerMasterIds: new Set([LONER_MASTER_ID]),
      ...overrides,
    });

  it('returns the ids whose skill master is named Loner in any case', () => {
    parser.extract.mockReturnValue(
      new Map([
        [11, { name: 'Loner', isElite: false }],
        [12, { name: 'loner', isElite: false }],
        [13, { name: 'Block', isElite: false }],
      ]),
    );

    expect(service.lonerMasterIds({ raw: 'roster' })).toEqual(
      new Set([11, 12]),
    );
    expect(parser.extract).toHaveBeenCalledWith({ raw: 'roster' });
  });

  it('marks a match-snapshot-only Journeyman in a team position', () => {
    expect(
      decide({
        player: rosterPlayer({ name: 'Journeyman' }),
        isRosterEntry: false,
      }),
    ).toBe(true);
  });

  it('marks a roster Journeyman whose skills list Loner', () => {
    expect(decide({})).toBe(true);
  });

  it('clears the marker of a roster Journeyman whose skills list no Loner', () => {
    expect(decide({ player: journeyman([13]) })).toBe(false);
  });

  it('marks a roster Journeyman when Loner cannot be checked', () => {
    expect(decide({ lonerMasterIds: undefined })).toBe(true);
  });

  it('clears the marker of a roster entry with another name', () => {
    expect(
      decide({ player: journeyman([LONER_MASTER_ID], { name: 'Grim' }) }),
    ).toBe(false);
  });

  it('never marks a Big Guy hire', () => {
    expect(
      decide({ player: journeyman([LONER_MASTER_ID], { isBigGuy: true }) }),
    ).toBe(false);
  });

  it('never marks a mercenary hire', () => {
    expect(
      decide({
        position: {
          positionId: 31,
          mercenary: mock<NonNullable<ResolvedPlayerPosition['mercenary']>>(),
        },
      }),
    ).toBe(false);
  });

  it('never marks a player in a roster star position', () => {
    expect(
      decide({
        player: journeyman([LONER_MASTER_ID], { lineUpMasterId: 900 }),
        roster: tpRoster({
          starPositions: [
            {
              tpPositionId: 900,
              name: 'Griff Oberwald',
              characteristics: mock(),
            },
          ],
        }),
      }),
    ).toBe(false);
  });
});
