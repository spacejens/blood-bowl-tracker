import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { OfficialTeamsParserService } from './official-teams-parser.service';

/**
 * Trimmed excerpts from the real recorded responses
 * (`tools/import-tp/data/teams/<rulesSet>/rosters_masters?ruleSet=<n>.json`):
 * BB2020's Human roster (`leagues` absent, availability via
 * `teamSpecialRules`) and BB2025's Wood Elf roster (`leagues` present).
 * Field names and bitmask values are verbatim from those files.
 */
const RESPONSE = {
  rosterMasters: [
    {
      id: 41,
      name: 'Human',
      teamRace: 'Human',
      teamRosterType: 0,
      teamSpecialRules: 16,
      selectableTeamSpecialRules: 0,
      tier: 2,
      lineUpMasters: [
        {
          id: 285,
          rosterMasterId: 41,
          position: 'Human Lineman',
          quantity: 16,
          cost: 50000,
          ma: 6,
          st: 3,
          ag: 3,
          pa: 4,
          av: 9,
          skills: [],
        },
        {
          id: 286,
          rosterMasterId: 41,
          position: 'Ogre',
          quantity: 1,
          cost: 140000,
          ma: 5,
          st: 5,
          ag: 4,
          pa: 5,
          av: 10,
          isBigGuy: true,
          skills: [],
        },
      ],
    },
    {
      id: 53,
      name: 'Wood Elf',
      teamRace: 'WoodElf',
      teamRosterType: 0,
      teamSpecialRules: 2,
      selectableTeamSpecialRules: 0,
      lineUpMasters: [
        {
          id: 373,
          rosterMasterId: 53,
          position: 'Wood Elf Lineman',
          quantity: 16,
          cost: 70000,
          ma: 7,
          st: 3,
          ag: 2,
          pa: 4,
          av: 8,
          skills: [],
        },
      ],
    },
    {
      id: 54,
      name: 'Amazon',
      teamRace: 'Amazon',
      // Legacy roster: an older but genuinely played roster generation, so it
      // is parsed alongside the official ones.
      teamRosterType: 1,
      teamSpecialRules: 8,
      selectableTeamSpecialRules: 0,
      lineUpMasters: [
        {
          id: 400,
          rosterMasterId: 54,
          position: 'Eagle Warrior Linewoman',
          quantity: 16,
          cost: 50000,
          ma: 6,
          st: 3,
          ag: 3,
          pa: 4,
          av: 8,
          skills: [],
        },
      ],
    },
    {
      id: 55,
      name: 'Bretonnian',
      teamRace: 'Bretonnian_2020',
      // Secret Bowl / unofficial roster: never parsed.
      teamRosterType: 3,
      teamSpecialRules: 16,
      selectableTeamSpecialRules: 0,
      lineUpMasters: [],
    },
    {
      id: 56,
      name: 'Slann',
      teamRace: 'Slann_BB2025',
      // Experimental roster: never parsed.
      teamRosterType: 4,
      teamSpecialRules: 8,
      selectableTeamSpecialRules: 0,
      lineUpMasters: [],
    },
  ],
  starplayerMasters: [
    {
      id: 382,
      quantity: 1,
      position: 'Griff Oberwald',
      cost: 280000,
      ma: 7,
      st: 4,
      ag: 2,
      pa: 3,
      av: 10,
      skills: [],
      isStarPlayer: true,
      // Halfling Thimble Cup (4) + Old World Classic (16).
      availableRaces: 0,
      availableTeamSpecialRules: 20,
      ruleSet: 20,
      specialRuleName: 'Consummate Professional',
    },
    {
      id: 390,
      quantity: 1,
      position: 'Roxanna Darknail',
      cost: 270000,
      ma: 8,
      st: 3,
      ag: 2,
      pa: 0,
      av: 8,
      skills: [],
      isStarPlayer: true,
      // Elven Kingdoms League (2) only.
      availableRaces: 0,
      availableTeamSpecialRules: 2,
      ruleSet: 20,
      specialRuleName: 'Slashing Nails',
    },
  ],
  inducementsMasters: [],
};

/** The BB2025 shape: availability by `leagues`, not by `teamSpecialRules`. */
const BB2025_RESPONSE = {
  rosterMasters: [
    {
      id: 172,
      name: 'Wood Elf',
      teamRace: 'WoodElf_BB2025',
      teamRosterType: 0,
      teamSpecialRules: 0,
      selectableTeamSpecialRules: 0,
      leagues: 258,
      selectableLeagues: 258,
      lineUpMasters: [
        {
          id: 1015,
          rosterMasterId: 172,
          position: 'Wood Elf Lineman',
          ma: 7,
          st: 3,
          ag: 2,
          pa: 4,
          av: 8,
          race: [101],
          skills: [],
        },
      ],
    },
    {
      id: 177,
      name: 'Norse',
      teamRace: 'Norse_BB2025',
      teamRosterType: 0,
      // Norse carries Favoured of Khorne as a SELECTABLE special rule only.
      teamSpecialRules: 0,
      selectableTeamSpecialRules: 1024,
      leagues: 528,
      selectableLeagues: 528,
      lineUpMasters: [
        {
          id: 1038,
          rosterMasterId: 177,
          position: 'Norse Raider Lineman',
          ma: 6,
          st: 3,
          ag: 3,
          pa: 4,
          av: 8,
          race: [112],
          skills: [],
        },
      ],
    },
  ],
  starplayerMasters: [
    {
      id: 1089,
      quantity: 1,
      position: 'Deeproot Strongbranch',
      ma: 3,
      st: 7,
      ag: 5,
      pa: 5,
      av: 11,
      skills: [],
      isStarPlayer: true,
      // Halfling Thimble Cup league (256): Halfling, Wood Elf, Gnome.
      availableLeagues: 256,
      ruleSet: 25,
      specialRuleName: 'Reliable',
      race: [116],
    },
    {
      id: 1120,
      quantity: 1,
      position: 'Max Spleenripper',
      ma: 5,
      st: 5,
      ag: 4,
      pa: 6,
      av: 10,
      skills: [],
      isStarPlayer: true,
      // No `availableLeagues` at all: BB2025 keeps the Favoured-of-Khorne
      // special rule (1024) as the availability mechanism for this star.
      availableTeamSpecialRules: 1024,
      ruleSet: 25,
      specialRuleName: 'Maximum Carnage',
      race: [112],
    },
  ],
  inducementsMasters: [],
};

const names = (positions: { name: string }[]): string[] =>
  positions.map((position) => position.name);

describe('OfficialTeamsParserService', () => {
  let service: OfficialTeamsParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [OfficialTeamsParserService],
    }).compile();
    service = moduleRef.get(OfficialTeamsParserService);
  });

  it('parses a race with its display name and team race code', () => {
    const [race] = service.parse(RESPONSE);

    expect(race.name).toBe('Human');
    expect(race.teamRaceCode).toBe('Human');
  });

  it('parses a regular position with its characteristics and TP position id', () => {
    const [race] = service.parse(RESPONSE);

    expect(race.positions).toContainEqual({
      name: 'Human Lineman',
      isStarPlayer: false,
      tpPositionId: 285,
      characteristics: {
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      },
    });
  });

  it('parses a star player through the same shape, flagged as a star', () => {
    const [race] = service.parse(RESPONSE);

    expect(race.positions).toContainEqual({
      name: 'Griff Oberwald',
      isStarPlayer: true,
      tpPositionId: 382,
      characteristics: {
        move: 7,
        strength: 4,
        agility: 2,
        passing: 3,
        armour: 10,
      },
    });
  });

  it('carries a passing value of 0 through as the real value it is', () => {
    const [, woodElf] = service.parse(RESPONSE);

    expect(
      woodElf.positions.find((position) => position.name === 'Roxanna Darknail')
        ?.characteristics.passing,
    ).toBe(0);
  });

  it('parses legacy rosters alongside the official ones', () => {
    expect(service.parse(RESPONSE).map((race) => race.teamRaceCode)).toContain(
      'Amazon',
    );
  });

  it('tags each race as official or legacy from its roster type', () => {
    const races = service.parse(RESPONSE);
    const amazon = races.find((race) => race.teamRaceCode === 'Amazon');
    const human = races.find((race) => race.teamRaceCode === 'Human');

    expect(amazon?.isOfficial).toBe(false);
    expect(human?.isOfficial).toBe(true);
  });

  it('excludes Secret Bowl and experimental rosters', () => {
    expect(service.parse(RESPONSE).map((race) => race.teamRaceCode)).toEqual([
      'Human',
      'WoodElf',
      'Amazon',
    ]);
  });

  it('gives each race only the stars its team special rules allow', () => {
    const [human, woodElf] = service.parse(RESPONSE);

    expect(names(human.positions)).toEqual([
      'Human Lineman',
      'Ogre',
      'Griff Oberwald',
    ]);
    expect(names(woodElf.positions)).toEqual([
      'Wood Elf Lineman',
      'Roxanna Darknail',
    ]);
  });

  it('matches BB2025 stars on leagues instead of team special rules', () => {
    const [woodElf] = service.parse(BB2025_RESPONSE);

    expect(names(woodElf.positions)).toEqual([
      'Wood Elf Lineman',
      'Deeproot Strongbranch',
    ]);
  });

  it('matches a star against a race that carries the rule as selectable only', () => {
    const [, norse] = service.parse(BB2025_RESPONSE);

    expect(names(norse.positions)).toEqual([
      'Norse Raider Lineman',
      'Max Spleenripper',
    ]);
  });

  it('omits tpPositionId when the official list carries none for a position', () => {
    const [race] = service.parse({
      rosterMasters: [
        {
          id: 1,
          name: 'Amazon',
          teamRace: 'Amazon_BB2020',
          teamRosterType: 0,
          teamSpecialRules: 8,
          selectableTeamSpecialRules: 0,
          lineUpMasters: [
            {
              position: 'Eagle Warrior Linewoman',
              ma: 6,
              st: 3,
              ag: 3,
              pa: 4,
              av: 8,
            },
          ],
        },
      ],
      starplayerMasters: [],
    });

    expect(race.positions[0].tpPositionId).toBeUndefined();
  });

  it('returns an empty position list for a race with no positions', () => {
    const [race] = service.parse({
      rosterMasters: [
        {
          id: 1,
          name: 'Amazon',
          teamRace: 'Amazon_BB2020',
          teamRosterType: 0,
          teamSpecialRules: 8,
          selectableTeamSpecialRules: 0,
          lineUpMasters: [],
        },
      ],
      starplayerMasters: [],
    });

    expect(race.positions).toEqual([]);
  });

  it('throws naming the failing field on a shape mismatch', () => {
    expect(() =>
      service.parse({
        rosterMasters: [{ id: 1, name: 'Amazon' }],
        starplayerMasters: [],
      }),
    ).toThrow(/Invalid TP official teams JSON.*teamRace/s);
  });

  it('throws when the payload is not an object at all', () => {
    expect(() => service.parse('nope')).toThrow(
      /Invalid TP official teams JSON/,
    );
  });
});
