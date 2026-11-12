import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { JourneymanRuleService } from '@blood-bowl-tracker/import-shared';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpSkillIdLookupService } from '../../tp-skill-id-lookup.service';
import {
  rosterPlayer,
  TP_SYSTEM_ID,
  tpRoster,
} from '../tp-roster.test-helpers';
import type { TpJourneymanDecideOptions } from './tp-journeyman.service';
import { TpJourneymanService } from './tp-journeyman.service';
import type { ResolvedPlayerPosition } from './tp-player-position.service';

const LONER_MASTER_ID = 11;
const BASIC_POSITION: ResolvedPlayerPosition = {
  positionId: 31,
  mercenary: undefined,
};

/**
 * Line-up 1008237 as a Sasong 26 match snapshot carries it: a Rotter Lineman
 * still named Journeyman, whose snapshot lists no Loner.
 */
const ROTTER_1008237 = rosterPlayer({
  id: 1008237,
  name: 'Journeyman',
  number: 19,
  lineUpMasterId: 321,
  fallbackPositionName: 'Rotter Lineman',
  totalStarPlayerPoints: 4,
  starPlayerPoints: 1,
  state: 16,
  isActive: false,
  skillMasterIds: [103, 151, 156],
});

/**
 * Line-up 2688140 as a Chaos Cup 8 match snapshot carries it: a Snotling
 * Lineman whose snapshot lists Loner as id 154, which neither his roster file
 * nor his match files name.
 */
const SNOTLING_2688140 = rosterPlayer({
  id: 2688140,
  name: 'Journeyman',
  number: 19,
  lineUpMasterId: 1027,
  fallbackPositionName: 'Snotling Lineman',
  totalStarPlayerPoints: 0,
  starPlayerPoints: 0,
  state: 72,
  isActive: false,
  skillMasterIds: [154, 199, 309, 285, 205, 288, 292],
});

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
  let lookup: MockProxy<TpSkillIdLookupService>;
  let errors: ImportError[];

  beforeEach(async () => {
    parser = mock<SkillMasterNamesParserService>();
    lookup = mock<TpSkillIdLookupService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpJourneymanService,
        // Pure, dependency-free decision logic, passed real.
        JourneymanRuleService,
        { provide: SkillMasterNamesParserService, useValue: parser },
        { provide: TpSkillIdLookupService, useValue: lookup },
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

  it('marks a match-snapshot-only Journeyman whose snapshot lists Loner', () => {
    expect(
      decide({
        player: rosterPlayer({
          name: 'Journeyman',
          skillMasterIds: [41, LONER_MASTER_ID],
        }),
        isRosterEntry: false,
      }),
    ).toBe(true);
  });

  it('makes no claim for a match-snapshot-only Journeyman whose snapshot lists no Loner', () => {
    expect(
      decide({
        player: rosterPlayer({ name: 'Journeyman', skillMasterIds: [41] }),
        isRosterEntry: false,
      }),
    ).toBeUndefined();
  });

  it('makes no claim for a match-snapshot-only Journeyman whose skills are unknown', () => {
    expect(
      decide({
        player: rosterPlayer({ name: 'Journeyman' }),
        isRosterEntry: false,
      }),
    ).toBeUndefined();
  });

  describe('lineUpLonerMasterIds', () => {
    const lineUpLonerMasterIds = (
      players: TpRosterPlayer[],
      rosterLonerMasterIds?: ReadonlySet<number>,
    ) =>
      service.lineUpLonerMasterIds({
        players,
        rosterLonerMasterIds,
        tpSystemId: TP_SYSTEM_ID,
        errors,
      });

    it('names the line-up Loner ids the roster does not through the database, in one lookup', async () => {
      lookup.namesByTpId.mockResolvedValue(
        new Map([
          [154, 'Loner'],
          [199, 'Dodge'],
          [103, 'Shadowing'],
          [156, 'Plague Ridden'],
        ]),
      );

      const ids = await lineUpLonerMasterIds(
        [SNOTLING_2688140, ROTTER_1008237],
        new Set([278, 309]),
      );

      expect(ids).toEqual(new Set([278, 309, 154]));
      expect(lookup.namesByTpId).toHaveBeenCalledTimes(1);
      expect(lookup.namesByTpId).toHaveBeenCalledWith({
        masterIds: [154, 199, 285, 205, 288, 292, 103, 151, 156],
        tpSystemId: TP_SYSTEM_ID,
        errors,
      });
    });

    it('looks up only the skills of line-up players named Journeyman', async () => {
      const ids = await lineUpLonerMasterIds([
        rosterPlayer({ name: 'Grim', skillMasterIds: [154] }),
      ]);

      expect(ids).toEqual(new Set());
      expect(lookup.namesByTpId).not.toHaveBeenCalled();
    });

    it("keeps the roster's Loner ids when the lookup fails", async () => {
      lookup.namesByTpId.mockResolvedValue(undefined);

      await expect(
        lineUpLonerMasterIds([SNOTLING_2688140], new Set([278])),
      ).resolves.toEqual(new Set([278]));
    });

    it('marks the Snotling whose Loner only the database names', async () => {
      lookup.namesByTpId.mockResolvedValue(new Map([[154, 'Loner']]));

      const lonerMasterIds = await lineUpLonerMasterIds(
        [SNOTLING_2688140],
        new Set([278]),
      );

      expect(
        decide({
          player: SNOTLING_2688140,
          isRosterEntry: false,
          lonerMasterIds,
        }),
      ).toBe(true);
    });

    it('makes no claim for Rotter 1008237, whose snapshot lists no Loner', async () => {
      lookup.namesByTpId.mockResolvedValue(
        new Map([
          [103, 'Shadowing'],
          [156, 'Plague Ridden'],
        ]),
      );

      const lonerMasterIds = await lineUpLonerMasterIds(
        [ROTTER_1008237],
        new Set([154]),
      );

      expect(
        decide({
          player: ROTTER_1008237,
          isRosterEntry: false,
          lonerMasterIds,
        }),
      ).toBeUndefined();
    });
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
