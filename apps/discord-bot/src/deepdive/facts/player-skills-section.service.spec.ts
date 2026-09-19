import type { PlayerSkillRow } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PlayerSkillsSectionService } from './player-skills-section.service';

/** One row, defaulted to an ordinary curated starting skill. */
function skill(
  overrides: Partial<PlayerSkillRow> & { skillName: string },
): PlayerSkillRow {
  return {
    skillId: 1,
    source: 'starting',
    attributeValue: null,
    advancementOrder: null,
    category: 'general',
    isElite: false,
    ...overrides,
  };
}

describe('PlayerSkillsSectionService', () => {
  let service: PlayerSkillsSectionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerSkillsSectionService],
    }).compile();
    service = moduleRef.get(PlayerSkillsSectionService);
  });

  it('returns no lines at all for a player with no skills', () => {
    expect(service.build([])).toEqual([]);
  });

  it('omits the gained line for a player who has gained nothing', () => {
    expect(service.build([skill({ skillName: 'Block' })])).toEqual([
      'Starting skills: Block',
    ]);
  });

  it('omits the starting line for a player with only gained skills', () => {
    expect(
      service.build([
        skill({ skillName: 'Guard', source: 'chosen', advancementOrder: 0 }),
      ]),
    ).toEqual(['Gained skills: Guard']);
  });

  it('renders both lines, starting first', () => {
    expect(
      service.build([
        skill({ skillName: 'Block' }),
        skill({ skillName: 'Guard', source: 'chosen', advancementOrder: 0 }),
      ]),
    ).toEqual(['Starting skills: Block', 'Gained skills: Guard']);
  });

  it('shows an attribute value in parentheses after the name', () => {
    expect(
      service.build([skill({ skillName: 'Loner', attributeValue: '4+' })]),
    ).toEqual(['Starting skills: Loner (4+)']);
  });

  it('marks a randomly rolled skill with the dice', () => {
    expect(
      service.build([
        skill({ skillName: 'Guard', source: 'random', advancementOrder: 0 }),
      ]),
    ).toEqual(['Gained skills: ⚄ Guard']);
  });

  it('leaves an unspecified advancement unmarked', () => {
    expect(
      service.build([
        skill({
          skillName: 'Guard',
          source: 'advancement',
          advancementOrder: 0,
        }),
      ]),
    ).toEqual(['Gained skills: Guard']);
  });

  it('leaves a freely chosen skill unmarked', () => {
    expect(
      service.build([
        skill({ skillName: 'Guard', source: 'chosen', advancementOrder: 0 }),
      ]),
    ).toEqual(['Gained skills: Guard']);
  });

  it('marks an elite gained skill with the gem', () => {
    expect(
      service.build([
        skill({
          skillName: 'Mighty Blow',
          source: 'chosen',
          advancementOrder: 0,
          isElite: true,
        }),
      ]),
    ).toEqual(['Gained skills: ♦ Mighty Blow']);
  });

  it('shows the dice before the gem when a skill was both', () => {
    expect(
      service.build([
        skill({
          skillName: 'Mighty Blow',
          source: 'random',
          advancementOrder: 0,
          isElite: true,
        }),
      ]),
    ).toEqual(['Gained skills: ⚄ ♦ Mighty Blow']);
  });

  it('shows a marker and an attribute value together', () => {
    expect(
      service.build([
        skill({
          skillName: 'Mighty Blow',
          source: 'random',
          advancementOrder: 0,
          attributeValue: '4+',
        }),
      ]),
    ).toEqual(['Gained skills: ⚄ Mighty Blow (4+)']);
  });

  it('never marks a starting skill as elite', () => {
    // Elite status marks a skill that costs more player value to pick during
    // advancement. A starting skill was never picked at that cost, so the gem
    // would misread as a claim about how the player got it.
    expect(
      service.build([skill({ skillName: 'Block', isElite: true })]),
    ).toEqual(['Starting skills: Block']);
  });

  it('sorts starting skills alphabetically', () => {
    expect(
      service.build([
        skill({ skillName: 'Dodge' }),
        skill({ skillName: 'Block' }),
        skill({ skillName: 'Catch' }),
      ]),
    ).toEqual(['Starting skills: Block, Catch, Dodge']);
  });

  it('sorts gained skills by the order they were gained in', () => {
    expect(
      service.build([
        skill({ skillName: 'Guard', source: 'chosen', advancementOrder: 2 }),
        skill({ skillName: 'Block', source: 'chosen', advancementOrder: 1 }),
      ]),
    ).toEqual(['Gained skills: Block, Guard']);
  });

  it('puts a gained skill with no recorded order last, alphabetically', () => {
    expect(
      service.build([
        skill({ skillName: 'Tackle', source: 'advancement' }),
        skill({ skillName: 'Guard', source: 'advancement' }),
        skill({ skillName: 'Block', source: 'chosen', advancementOrder: 1 }),
      ]),
    ).toEqual(['Gained skills: Block, Guard, Tackle']);
  });
});
