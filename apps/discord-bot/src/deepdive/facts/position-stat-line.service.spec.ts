import type {
  PositionCharacteristics,
  PositionStartingSkill,
} from '@blood-bowl-tracker/game-data';
import { CharacteristicDisplayFormattingService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PositionCharacteristicsLineFormatterService } from './position-characteristics-line-formatter.service';
import { PositionStatLineService } from './position-stat-line.service';

const bb2020: PositionCharacteristics = {
  rulesSetId: 2,
  rulesSetName: 'BB2020',
  moveFormat: 'bare',
  move: 7,
  strengthFormat: 'bare',
  strength: 3,
  agilityFormat: 'plus',
  agility: 3,
  passingFormat: 'plus',
  passing: 4,
  armourFormat: 'plus',
  armour: 9,
};

const bb2016: PositionCharacteristics = {
  rulesSetId: 1,
  rulesSetName: 'BB2016',
  moveFormat: 'bare',
  move: 6,
  strengthFormat: 'bare',
  strength: 3,
  agilityFormat: 'plus',
  agility: 4,
  passingFormat: 'plus',
  passing: 5,
  armourFormat: 'plus',
  armour: 8,
};

/** The characteristics half both fixtures render to, for readability below. */
const BB2020_CHARACTERISTICS = 'BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+';
const BB2016_CHARACTERISTICS = 'BB2016: MA 6 ST 3 AG 4+ PA 5+ AV 8+';

function skill(
  overrides: Partial<PositionStartingSkill> & { skillName: string },
): PositionStartingSkill {
  return {
    rulesSetId: 2,
    rulesSetName: 'BB2020',
    skillId: 1,
    attributeValue: null,
    category: 'general',
    ...overrides,
  };
}

describe('PositionStatLineService', () => {
  let service: PositionStatLineService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionStatLineService,
        // Both collaborators are real: this is CLAUDE.md's pure-chain
        // carve-out. Neither has I/O or external state, and mocking the
        // line formatter would leave the assembled line -- the entire
        // output of this service -- unasserted.
        PositionCharacteristicsLineFormatterService,
        CharacteristicDisplayFormattingService,
      ],
    }).compile();
    service = moduleRef.get(PositionStatLineService);
  });

  describe('formatLine', () => {
    it('appends comma-joined skills after the characteristics, separated by a single space', () => {
      expect(
        service.formatLine(bb2020, [
          skill({ skillId: 1, skillName: 'Block' }),
          skill({ skillId: 2, skillName: 'Dodge', category: 'agility' }),
        ]),
      ).toBe(`${BB2020_CHARACTERISTICS} Block, Dodge`);
    });

    it("shows a skill's attribute value in parentheses after its name", () => {
      expect(
        service.formatLine(bb2020, [
          skill({
            skillId: 3,
            skillName: 'Loner',
            category: 'trait',
            attributeValue: '4+',
          }),
        ]),
      ).toBe(`${BB2020_CHARACTERISTICS} Loner (4+)`);
    });

    it("marks a unique-category skill -- a star's own exclusive skill -- with a star", () => {
      expect(
        service.formatLine(bb2020, [
          skill({
            skillId: 4,
            skillName: 'Mighty Blow (Grombrindal)',
            category: 'unique',
          }),
        ]),
      ).toBe(`${BB2020_CHARACTERISTICS} ★ Mighty Blow (Grombrindal)`);
    });

    it('omits the skills segment entirely when the rules set has no starting skills recorded', () => {
      // Not a placeholder dash: the line reads as the plain characteristics
      // line it was before starting skills were shown at all, with no
      // trailing space.
      expect(service.formatLine(bb2016, [])).toBe(BB2016_CHARACTERISTICS);
    });

    it('combines an ordinary, an attribute-valued and a unique skill on one line, in the order given', () => {
      expect(
        service.formatLine(bb2020, [
          skill({ skillId: 1, skillName: 'Block' }),
          skill({
            skillId: 3,
            skillName: 'Loner',
            category: 'trait',
            attributeValue: '4+',
          }),
          skill({
            skillId: 4,
            skillName: 'Mighty Blow (Grombrindal)',
            category: 'unique',
          }),
        ]),
      ).toBe(
        `${BB2020_CHARACTERISTICS} Block, Loner (4+), ★ Mighty Blow (Grombrindal)`,
      );
    });
  });

  describe('formatLines', () => {
    it('pairs each rules set with only its own skills', () => {
      const lines = service.formatLines(
        [bb2016, bb2020],
        [
          skill({
            rulesSetId: 1,
            rulesSetName: 'BB2016',
            skillId: 1,
            skillName: 'Block',
          }),
          skill({ rulesSetId: 2, skillId: 2, skillName: 'Dodge' }),
        ],
      );

      expect(lines).toEqual([
        `${BB2016_CHARACTERISTICS} Block`,
        `${BB2020_CHARACTERISTICS} Dodge`,
      ]);
    });

    it('keeps the rules-set order it was given rather than the skill list order', () => {
      const lines = service.formatLines(
        [bb2020, bb2016],
        [
          skill({
            rulesSetId: 1,
            rulesSetName: 'BB2016',
            skillId: 1,
            skillName: 'Block',
          }),
        ],
      );

      expect(lines).toEqual([
        BB2020_CHARACTERISTICS,
        `${BB2016_CHARACTERISTICS} Block`,
      ]);
    });

    it('leaves a rules set whose skills were never curated as a bare characteristics line while still showing another rules set that has them', () => {
      const lines = service.formatLines(
        [bb2016, bb2020],
        [skill({ rulesSetId: 2, skillId: 2, skillName: 'Dodge' })],
      );

      expect(lines).toEqual([
        BB2016_CHARACTERISTICS,
        `${BB2020_CHARACTERISTICS} Dodge`,
      ]);
    });

    it('returns an empty list when there are no rules sets at all', () => {
      expect(service.formatLines([], [])).toEqual([]);
    });
  });
});
