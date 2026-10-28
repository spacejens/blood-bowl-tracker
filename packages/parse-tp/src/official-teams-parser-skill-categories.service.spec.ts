import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { OfficialTeamsParserService } from './official-teams-parser.service';
import { TpSkillCategoryMaskDecoderService } from './tp-skill-category-mask-decoder.service';

const CHARACTERISTICS = { ma: 6, st: 3, ag: 3, pa: 4, av: 9, skills: [] };

/** A minimal one-roster response; masks are verbatim BB2020 Human values. */
function response(
  lineUps: Record<string, unknown>[],
  star?: Record<string, unknown>,
) {
  return {
    rosterMasters: [
      {
        name: 'Human',
        teamRace: 'Human',
        teamRosterType: 0,
        teamSpecialRules: 16,
        selectableTeamSpecialRules: 0,
        lineUpMasters: lineUps.map((lineUp, index) => ({
          id: 285 + index,
          position: index === 0 ? 'Human Lineman' : `Position ${index}`,
          ...CHARACTERISTICS,
          ...lineUp,
        })),
      },
    ],
    starplayerMasters:
      star === undefined
        ? []
        : [
            {
              id: 9,
              position: 'Griff Oberwald',
              availableTeamSpecialRules: 16,
              ...CHARACTERISTICS,
              ...star,
            },
          ],
  };
}

describe('OfficialTeamsParserService skill categories', () => {
  let parser: OfficialTeamsParserService;

  beforeEach(async () => {
    // The decoder is a pure, dependency-free link of the parser's chain, so
    // it is passed real (CLAUDE.md, "pure chain").
    const moduleRef = await Test.createTestingModule({
      providers: [
        OfficialTeamsParserService,
        TpSkillCategoryMaskDecoderService,
      ],
    }).compile();
    parser = moduleRef.get(OfficialTeamsParserService);
  });

  it('decodes skillNormal as primary and skillDouble as secondary', () => {
    const [race] = parser.parse(
      response([{ skillNormal: 2, skillDouble: 17 }]),
    );

    expect(race.positions[0].skillCategories).toEqual({
      primary: ['general'],
      secondary: ['agility', 'strength'],
    });
    expect(race.positions[0].skillCategoriesError).toBeUndefined();
  });

  it('treats absent masks as no categories, for positions and stars alike', () => {
    const [race] = parser.parse(response([{}], {}));

    expect(race.positions.map((p) => p.skillCategories)).toEqual([
      { primary: [], secondary: [] },
      { primary: [], secondary: [] },
    ]);
  });

  it('keeps a zero primary mask with a non-zero secondary one', () => {
    const [race] = parser.parse(response([{ skillNormal: 0, skillDouble: 1 }]));

    expect(race.positions[0].skillCategories).toEqual({
      primary: [],
      secondary: ['agility'],
    });
  });

  it('rejects an unknown bit, naming the roster, position and field', () => {
    expect(() =>
      parser.parse(response([{ skillNormal: 2 | 32, skillDouble: 0 }])),
    ).toThrow(
      'Invalid TP official teams JSON: Human / Human Lineman skillNormal: TP skill category mask 34 sets unknown bit(s) 32',
    );
  });

  it('rejects an unknown bit on skillDouble too', () => {
    expect(() =>
      parser.parse(response([{ skillNormal: 2, skillDouble: 64 }])),
    ).toThrow(/Human Lineman skillDouble: .*unknown bit\(s\) 64/);
  });

  it('flags only a position whose category is both primary and secondary', () => {
    const [race] = parser.parse(
      response([
        { skillNormal: 3, skillDouble: 2 | 16 },
        { skillNormal: 2, skillDouble: 1 },
      ]),
    );

    expect(race.positions[0].skillCategories).toEqual({
      primary: [],
      secondary: [],
    });
    expect(race.positions[0].skillCategoriesError).toBe(
      'Human / Human Lineman: skill category general is listed as both primary and secondary',
    );
    expect(race.positions[1].skillCategories).toEqual({
      primary: ['general'],
      secondary: ['agility'],
    });
    expect(race.positions[1].skillCategoriesError).toBeUndefined();
  });

  it('names every category listed as both primary and secondary', () => {
    const [race] = parser.parse(
      response([{ skillNormal: 1 | 2, skillDouble: 1 | 2 }]),
    );

    expect(race.positions[0].skillCategoriesError).toBe(
      'Human / Human Lineman: skill categories agility, general are listed as both primary and secondary',
    );
  });
});
