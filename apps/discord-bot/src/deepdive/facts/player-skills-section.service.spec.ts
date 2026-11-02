import type {
  PlayerCharacteristicAdvancementRow,
  PlayerSkillRow,
} from '@blood-bowl-tracker/game-data';
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
    isFreeExtra: false,
    ...overrides,
  };
}

const increase = (
  characteristic: PlayerCharacteristicAdvancementRow['characteristic'],
  advancementOrder: number | null,
): PlayerCharacteristicAdvancementRow => ({
  characteristic,
  advancementOrder,
  orderConfirmed: false,
});

describe('PlayerSkillsSectionService', () => {
  let service: PlayerSkillsSectionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerSkillsSectionService],
    }).compile();
    service = moduleRef.get(PlayerSkillsSectionService);
  });

  it('places increases among gained skills by order', () => {
    expect(
      service.build(
        [
          skill({ skillName: 'Block', source: 'chosen', advancementOrder: 1 }),
          skill({ skillName: 'Dodge', source: 'chosen', advancementOrder: 3 }),
        ],
        {
          pricesByKind: false,
          characteristicAdvancements: [increase('AG', 2)],
        },
      ),
    ).toEqual(['Advancements: Block, +AG, Dodge']);
  });

  it('lists unknown-order skills, then unknown-order increases in stat-line order, last', () => {
    expect(
      service.build(
        [
          skill({
            skillName: 'Guard',
            source: 'chosen',
            advancementOrder: null,
          }),
          skill({ skillName: 'Block', source: 'chosen', advancementOrder: 1 }),
        ],
        {
          pricesByKind: false,
          characteristicAdvancements: [
            increase('AV', null),
            increase('MA', null),
          ],
        },
      ),
    ).toEqual(['Advancements: Block, Guard, +MA, +AV']);
  });

  it('shows the line for a player with only increases', () => {
    expect(
      service.build([], {
        pricesByKind: false,
        characteristicAdvancements: [increase('ST', null)],
      }),
    ).toEqual(['Advancements: +ST']);
  });

  it('keeps the skill markers on the merged line', () => {
    expect(
      service.build(
        [skill({ skillName: 'Guard', source: 'random', advancementOrder: 1 })],
        {
          pricesByKind: false,
          characteristicAdvancements: [increase('AG', 2)],
        },
      ),
    ).toEqual(['Advancements: ⚄ Guard, +AG']);
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
    ).toEqual(['Advancements: Guard']);
  });

  it('renders both lines, starting first', () => {
    expect(
      service.build([
        skill({ skillName: 'Block' }),
        skill({ skillName: 'Guard', source: 'chosen', advancementOrder: 0 }),
      ]),
    ).toEqual(['Starting skills: Block', 'Advancements: Guard']);
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
    ).toEqual(['Advancements: ⚄ Guard']);
  });

  it('leaves an unspecified advancement unmarked by default', () => {
    expect(
      service.build([
        skill({
          skillName: 'Guard',
          source: 'advancement',
          advancementOrder: 0,
        }),
      ]),
    ).toEqual(['Advancements: Guard']);
  });

  it('leaves an unspecified advancement unmarked in an era that does not price by kind', () => {
    // Every advancement costs the same there, so nothing about the skill's
    // cost depends on whether it was rolled or chosen.
    expect(
      service.build(
        [
          skill({
            skillName: 'Guard',
            source: 'advancement',
            advancementOrder: 0,
          }),
        ],
        { pricesByKind: false },
      ),
    ).toEqual(['Advancements: Guard']);
  });

  it('leaves a freely chosen skill unmarked', () => {
    expect(
      service.build([
        skill({ skillName: 'Guard', source: 'chosen', advancementOrder: 0 }),
      ]),
    ).toEqual(['Advancements: Guard']);
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
    ).toEqual(['Advancements: ♦ Mighty Blow']);
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
    ).toEqual(['Advancements: ⚄ ♦ Mighty Blow']);
  });

  it('marks a free extra gained skill with the cross', () => {
    expect(
      service.build([
        skill({
          skillName: 'Hatred',
          source: 'chosen',
          advancementOrder: 0,
          attributeValue: 'Undead',
          isFreeExtra: true,
        }),
      ]),
    ).toEqual(['Advancements: ✚ Hatred (Undead)']);
  });

  it('shows the dice, then the cross, then the gem', () => {
    expect(
      service.build([
        skill({
          skillName: 'Mighty Blow',
          source: 'random',
          advancementOrder: 0,
          isFreeExtra: true,
          isElite: true,
        }),
      ]),
    ).toEqual(['Advancements: ⚄ ✚ ♦ Mighty Blow']);
  });

  it('shows the cross before the star on a unique free extra skill', () => {
    expect(
      service.build([
        skill({
          skillName: 'Treacherous',
          source: 'advancement',
          advancementOrder: 0,
          category: 'unique',
          isFreeExtra: true,
        }),
      ]),
    ).toEqual(['Advancements: ✚ ★ Treacherous']);
  });

  it('never marks a starting skill as a free extra', () => {
    // A free extra is a gained skill that cost no SPP. A starting skill was
    // never gained, so the cross would misread as a claim about its origin.
    expect(
      service.build([skill({ skillName: 'Block', isFreeExtra: true })]),
    ).toEqual(['Starting skills: Block']);
  });

  it('marks only the free extra among several Hatred skills', () => {
    expect(
      service.build([
        skill({
          skillName: 'Hatred',
          source: 'chosen',
          advancementOrder: 0,
          attributeValue: 'Undead',
          isFreeExtra: true,
        }),
        skill({
          skillName: 'Hatred',
          source: 'chosen',
          advancementOrder: 1,
          attributeValue: 'Troll',
        }),
      ]),
    ).toEqual(['Advancements: ✚ Hatred (Undead), Hatred (Troll)']);
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
    ).toEqual(['Advancements: ⚄ Mighty Blow (4+)']);
  });

  it('never marks a starting skill as elite', () => {
    // Elite status marks a skill that costs more player value to pick during
    // advancement. A starting skill was never picked at that cost, so the gem
    // would misread as a claim about how the player got it.
    expect(
      service.build([skill({ skillName: 'Block', isElite: true })]),
    ).toEqual(['Starting skills: Block']);
  });

  it('marks a unique starting skill with the star', () => {
    expect(
      service.build([skill({ skillName: 'Treacherous', category: 'unique' })]),
    ).toEqual(['Starting skills: ★ Treacherous']);
  });

  it('marks a unique gained skill with the star', () => {
    expect(
      service.build([
        skill({
          skillName: 'Treacherous',
          source: 'chosen',
          advancementOrder: 0,
          category: 'unique',
        }),
      ]),
    ).toEqual(['Advancements: ★ Treacherous']);
  });

  it('shows the dice before the star when a unique skill was rolled', () => {
    expect(
      service.build([
        skill({
          skillName: 'Treacherous',
          source: 'random',
          advancementOrder: 0,
          category: 'unique',
        }),
      ]),
    ).toEqual(['Advancements: ⚄ ★ Treacherous']);
  });

  it('shows the star before the gem when a skill is both unique and elite', () => {
    // Curated data never has both, so this pins a deterministic tie-break
    // rather than a real case.
    expect(
      service.build([
        skill({
          skillName: 'Treacherous',
          source: 'random',
          advancementOrder: 0,
          category: 'unique',
          isElite: true,
        }),
      ]),
    ).toEqual(['Advancements: ⚄ ★ ♦ Treacherous']);
  });

  it('shows the star and an attribute value together', () => {
    expect(
      service.build([
        skill({
          skillName: 'Treacherous',
          category: 'unique',
          attributeValue: '4+',
        }),
      ]),
    ).toEqual(['Starting skills: ★ Treacherous (4+)']);
  });

  it('leaves a skill with no curated category unmarked', () => {
    expect(
      service.build([skill({ skillName: 'Block', category: null })]),
    ).toEqual(['Starting skills: Block']);
  });

  it('leaves a non-unique category unmarked', () => {
    expect(
      service.build([
        skill({ skillName: 'Block', category: 'general' }),
        skill({
          skillName: 'Guard',
          source: 'chosen',
          advancementOrder: 0,
          category: 'strength',
        }),
      ]),
    ).toEqual(['Starting skills: Block', 'Advancements: Guard']);
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
    ).toEqual(['Advancements: Block, Guard']);
  });

  it('puts a gained skill with no recorded order last, alphabetically', () => {
    expect(
      service.build([
        skill({ skillName: 'Tackle', source: 'advancement' }),
        skill({ skillName: 'Guard', source: 'advancement' }),
        skill({ skillName: 'Block', source: 'chosen', advancementOrder: 1 }),
      ]),
    ).toEqual(['Advancements: Block, Guard, Tackle']);
  });

  describe('in an era that prices advancements by kind', () => {
    const KIND_PRICED = { pricesByKind: true };

    it('marks an advancement of unknown source with the questioned dice', () => {
      expect(
        service.build(
          [
            skill({
              skillName: 'Guard',
              source: 'advancement',
              advancementOrder: 0,
            }),
          ],
          KIND_PRICED,
        ),
      ).toEqual(['Advancements: ⚄? Guard']);
    });

    it('keeps the plain dice on a rolled skill', () => {
      expect(
        service.build(
          [
            skill({
              skillName: 'Guard',
              source: 'random',
              advancementOrder: 0,
            }),
          ],
          KIND_PRICED,
        ),
      ).toEqual(['Advancements: ⚄ Guard']);
    });

    it('leaves a chosen skill unmarked', () => {
      expect(
        service.build(
          [
            skill({
              skillName: 'Guard',
              source: 'chosen',
              advancementOrder: 0,
            }),
          ],
          KIND_PRICED,
        ),
      ).toEqual(['Advancements: Guard']);
    });

    it('never marks a starting skill', () => {
      expect(
        service.build([skill({ skillName: 'Block' })], KIND_PRICED),
      ).toEqual(['Starting skills: Block']);
    });

    it('leaves a free extra with only its cross', () => {
      // A free extra cost nothing, so whether it was rolled or chosen does
      // not change any price.
      expect(
        service.build(
          [
            skill({
              skillName: 'Hatred',
              source: 'advancement',
              advancementOrder: 0,
              attributeValue: 'Undead',
              isFreeExtra: true,
            }),
          ],
          KIND_PRICED,
        ),
      ).toEqual(['Advancements: ✚ Hatred (Undead)']);
    });

    it('shows the questioned dice before the gem', () => {
      expect(
        service.build(
          [
            skill({
              skillName: 'Tackle',
              source: 'advancement',
              advancementOrder: 0,
              isElite: true,
            }),
          ],
          KIND_PRICED,
        ),
      ).toEqual(['Advancements: ⚄? ♦ Tackle']);
    });

    it('shows the questioned dice before the star', () => {
      expect(
        service.build(
          [
            skill({
              skillName: 'Treacherous',
              source: 'advancement',
              advancementOrder: 0,
              category: 'unique',
            }),
          ],
          KIND_PRICED,
        ),
      ).toEqual(['Advancements: ⚄? ★ Treacherous']);
    });

    it('marks only the advancements of unknown source on a mixed line', () => {
      expect(
        service.build(
          [
            skill({
              skillName: 'Block',
              source: 'chosen',
              advancementOrder: 0,
            }),
            skill({
              skillName: 'Guard',
              source: 'advancement',
              advancementOrder: 1,
            }),
            skill({
              skillName: 'Dodge',
              source: 'random',
              advancementOrder: 2,
            }),
          ],
          KIND_PRICED,
        ),
      ).toEqual(['Advancements: Block, ⚄? Guard, ⚄ Dodge']);
    });
  });
});
