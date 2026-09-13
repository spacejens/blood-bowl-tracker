import type { RulesSet } from '@blood-bowl-tracker/api-contract';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpLastingInjuryBuilderService } from './tp-lasting-injury-builder.service';

/** BB2020 and every other rules set TP covers: AG/PA/AV are roll targets. */
const bb2020: RulesSet = {
  id: 900,
  name: 'BB2020',
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
  createdAt: new Date('2026-01-01'),
};

/** A pre-BB2020 rules set: every characteristic is a plain number. */
const crp: RulesSet = {
  ...bb2020,
  id: 800,
  name: 'CRP',
  agilityFormat: 'bare',
  passingFormat: 'absent',
  armourFormat: 'bare',
};

function player(overrides: Partial<TpRosterPlayer> = {}): TpRosterPlayer {
  return {
    id: 2616375,
    name: 'Shezbeth Queen of Lies',
    number: 5,
    lineUpMasterId: 971,
    rosterId: 179572,
    fallbackPositionName: 'Halfling Catcher',
    isBigGuy: false,
    totalStarPlayerPoints: 21,
    lastingInjuries: { nigglingInjuries: 0, canPlayNextGame: true },
    characteristics: {
      move: 5,
      strength: 2,
      agility: 3,
      passing: 4,
      armour: 7,
    },
    positionTemplate: {
      move: 5,
      strength: 2,
      agility: 3,
      passing: 4,
      armour: 7,
    },
    ...overrides,
  };
}

const CLEAN = {
  missNextGame: false,
  nigglingInjuryCount: 0,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

describe('TpLastingInjuryBuilderService', () => {
  let service: TpLastingInjuryBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpLastingInjuryBuilderService],
    }).compile();
    service = moduleRef.get(TpLastingInjuryBuilderService);
  });

  it('reports an uninjured player as clean', () => {
    expect(
      service.forRosterPlayer({ player: player(), rulesSet: bb2020 }),
    ).toEqual(CLEAN);
  });

  it("maps TP's canPlayNextGame onto miss-next-game", () => {
    expect(
      service.forRosterPlayer({
        player: player({
          lastingInjuries: { nigglingInjuries: 0, canPlayNextGame: false },
        }),
        rulesSet: bb2020,
      }),
    ).toEqual({ ...CLEAN, missNextGame: true });
  });

  it('carries the niggling-injury count straight across', () => {
    expect(
      service.forRosterPlayer({
        player: player({
          lastingInjuries: { nigglingInjuries: 3, canPlayNextGame: true },
        }),
        rulesSet: bb2020,
      }),
    ).toEqual({ ...CLEAN, nigglingInjuryCount: 3 });
  });

  it('detects a lowered Armour target as a reduction under plus formats', () => {
    // Shezbeth Queen of Lies: av 6 against the template's 7. Armour is a
    // target the OPPONENT rolls, so a lower number is worse for the player.
    expect(
      service.forRosterPlayer({
        player: player({
          characteristics: {
            move: 5,
            strength: 2,
            agility: 3,
            passing: 4,
            armour: 6,
          },
        }),
        rulesSet: bb2020,
      }),
    ).toEqual({ ...CLEAN, armourReductionCount: 1 });
  });

  it('detects a raised Passing target as a reduction under plus formats', () => {
    // Arbaghakh the Gluttonous: pa 5 against the template's 4. Passing is a
    // target the PLAYER rolls, so a higher number is worse.
    expect(
      service.forRosterPlayer({
        player: player({
          characteristics: {
            move: 5,
            strength: 2,
            agility: 3,
            passing: 5,
            armour: 7,
          },
        }),
        rulesSet: bb2020,
      }),
    ).toEqual({ ...CLEAN, passingReductionCount: 1 });
  });

  it('detects a raised Agility target as a reduction under plus formats', () => {
    expect(
      service.forRosterPlayer({
        player: player({
          characteristics: {
            move: 5,
            strength: 2,
            agility: 5,
            passing: 4,
            armour: 7,
          },
        }),
        rulesSet: bb2020,
      }),
    ).toEqual({ ...CLEAN, agilityReductionCount: 2 });
  });

  it('does not mistake an advancement for a reduction', () => {
    // Shezbeth again: ma 6 against the template's 5 is an advancement under
    // `bare`, and it sits on the SAME entry as her real -1 AV injury.
    expect(
      service.forRosterPlayer({
        player: player({
          characteristics: {
            move: 6,
            strength: 2,
            agility: 3,
            passing: 4,
            armour: 6,
          },
        }),
        rulesSet: bb2020,
      }),
    ).toEqual({ ...CLEAN, armourReductionCount: 1 });
  });

  it('treats a lower number as worse for every characteristic under bare formats', () => {
    expect(
      service.forRosterPlayer({
        player: player({
          characteristics: {
            move: 4,
            strength: 2,
            agility: 2,
            passing: 4,
            armour: 6,
          },
          positionTemplate: {
            move: 5,
            strength: 2,
            agility: 3,
            passing: 4,
            armour: 7,
          },
        }),
        rulesSet: crp,
      }),
    ).toEqual({
      ...CLEAN,
      moveReductionCount: 1,
      agilityReductionCount: 1,
      armourReductionCount: 1,
    });
  });

  it('never compares a characteristic the rules set does not have', () => {
    expect(
      service.forRosterPlayer({
        player: player({
          characteristics: {
            move: 5,
            strength: 2,
            agility: 3,
            passing: 9,
            armour: 7,
          },
          positionTemplate: {
            move: 5,
            strength: 2,
            agility: 3,
            passing: 4,
            armour: 7,
          },
        }),
        rulesSet: crp,
      }),
    ).toEqual(CLEAN);
  });

  it('records the live half and no reductions when the template is missing', () => {
    // A mercenary hire has no catalog entry, so no baseline to diff against.
    // The niggling count and miss-next-game are still real and still sent.
    expect(
      service.forRosterPlayer({
        player: player({
          positionTemplate: undefined,
          lastingInjuries: { nigglingInjuries: 1, canPlayNextGame: false },
        }),
        rulesSet: bb2020,
      }),
    ).toEqual({ ...CLEAN, nigglingInjuryCount: 1, missNextGame: true });
  });

  it('records the live half and no reductions when the rules set is unresolved', () => {
    expect(
      service.forRosterPlayer({
        player: player({
          lastingInjuries: { nigglingInjuries: 1, canPlayNextGame: true },
        }),
        rulesSet: undefined,
      }),
    ).toEqual({ ...CLEAN, nigglingInjuryCount: 1 });
  });

  it('sends nothing at all for a player carrying no live state', () => {
    // A match-embedded-only entry. An omitted group leaves whatever is
    // already stored untouched, which beats overwriting real state with
    // zeroes inferred from an absence.
    expect(
      service.forRosterPlayer({
        player: player({ lastingInjuries: undefined }),
        rulesSet: bb2020,
      }),
    ).toBeUndefined();
  });

  it('sends no reductions when the player carries no characteristics', () => {
    expect(
      service.forRosterPlayer({
        player: player({ characteristics: undefined }),
        rulesSet: bb2020,
      }),
    ).toEqual(CLEAN);
  });
});
