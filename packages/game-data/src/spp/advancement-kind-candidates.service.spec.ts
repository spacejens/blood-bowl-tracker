import type { AdvancementKind } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import type {
  AdvancementCandidatesInput,
  AdvancementOption,
  ApplicableAdvancementCost,
  PlayerSkillEntry,
} from './unspent-spp.types';

let nextId = 1;

function gained(overrides: Partial<PlayerSkillEntry> = {}): PlayerSkillEntry {
  return {
    id: nextId++,
    skillId: 101,
    source: 'advancement',
    isFreeExtra: false,
    advancementOrder: null,
    orderConfirmed: false,
    ...overrides,
  };
}

function increase(overrides: Partial<PlayerSkillEntry> = {}): PlayerSkillEntry {
  return gained({ skillId: null, source: 'characteristic', ...overrides });
}

function cost(
  advancementNumber: number,
  advancementKind: AdvancementKind,
): ApplicableAdvancementCost {
  return { advancementNumber, advancementKind, skillId: null, sppCost: 10 };
}

function costs(
  advancementKind: AdvancementKind,
  sppCosts: number[],
): ApplicableAdvancementCost[] {
  return sppCosts.map((sppCost, index) => ({
    advancementNumber: index + 1,
    advancementKind,
    skillId: null,
    sppCost,
  }));
}

const FIXED = costs('table_roll', [6, 10, 15, 20, 25, 100]);
const BB2020 = [
  ...costs('random_primary_skill', [3, 4, 6, 8, 10, 15]),
  ...costs('chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
  ...costs('random_secondary_skill', [6, 8, 12, 16, 20, 30]),
  ...costs('chosen_secondary_skill', [12, 14, 18, 22, 26, 40]),
  ...costs('random_characteristic', [18, 20, 24, 28, 32, 50]),
];
const BB2025 = [
  ...costs('random_primary_skill', [3, 4, 6, 8, 10, 15]),
  ...costs('chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
  ...costs('chosen_secondary_skill', [10, 12, 16, 20, 24, 34]),
  ...costs('random_characteristic', [14, 16, 20, 24, 28, 38]),
];

function anyNumber(...kinds: AdvancementKind[]): AdvancementOption[] {
  return kinds.map((advancementKind) => ({
    advancementKind,
    advancementNumber: null,
  }));
}

function input(
  overrides: Partial<AdvancementCandidatesInput> = {},
): AdvancementCandidatesInput {
  return {
    skills: [],
    skillCategories: new Map(),
    positionAccess: new Map(),
    costs: BB2020,
    ...overrides,
  };
}

describe('AdvancementKindCandidatesService', () => {
  let service: AdvancementKindCandidatesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AdvancementKindCandidatesService],
    }).compile();
    service = moduleRef.get(AdvancementKindCandidatesService);
  });

  it('skips starting skills and free extra skills', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 1, source: 'starting', isFreeExtra: false }),
          gained({ skillId: 2, source: 'chosen', isFreeExtra: true }),
        ],
      }),
    );

    expect(result).toEqual([]);
  });

  it('allows every skill kind for a skill of unknown roll and category', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 101, source: 'advancement', isFreeExtra: false }),
        ],
      }),
    );

    expect(result).toEqual([
      anyNumber(
        'random_primary_skill',
        'chosen_primary_skill',
        'random_secondary_skill',
        'chosen_secondary_skill',
      ),
    ]);
  });

  it('keeps a chosen skill in a primary category to chosen primary', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 101, source: 'chosen', isFreeExtra: false }),
        ],
        skillCategories: new Map([[101, 'general']]),
        positionAccess: new Map([['general', 'primary']]),
      }),
    );

    expect(result).toEqual([anyNumber('chosen_primary_skill')]);
  });

  it('keeps a random skill in a secondary category to random secondary', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 101, source: 'random', isFreeExtra: false }),
        ],
        skillCategories: new Map([[101, 'agility']]),
        positionAccess: new Map([['agility', 'secondary']]),
      }),
    );

    expect(result).toEqual([anyNumber('random_secondary_skill')]);
  });

  it('allows primary and secondary when the position has no access to the category', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 101, source: 'chosen', isFreeExtra: false }),
        ],
        skillCategories: new Map([[101, 'mutation']]),
        positionAccess: new Map([['general', 'primary']]),
      }),
    );

    expect(result).toEqual([
      anyNumber('chosen_primary_skill', 'chosen_secondary_skill'),
    ]);
  });

  it('leaves no option for a random secondary skill under BB2025', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 101, source: 'random', isFreeExtra: false }),
        ],
        skillCategories: new Map([[101, 'agility']]),
        positionAccess: new Map([['agility', 'secondary']]),
        costs: BB2025,
      }),
    );

    expect(result).toEqual([[]]);
  });

  it('narrows an unknown-roll secondary skill to chosen under BB2025', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 101, source: 'advancement', isFreeExtra: false }),
        ],
        skillCategories: new Map([[101, 'agility']]),
        positionAccess: new Map([['agility', 'secondary']]),
        costs: BB2025,
      }),
    );

    expect(result).toEqual([anyNumber('chosen_secondary_skill')]);
  });

  it('prices every advancement as a table roll under fixed thresholds', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 101, source: 'chosen', isFreeExtra: false }),
          increase(),
        ],
        costs: FIXED,
      }),
    );

    expect(result).toEqual([anyNumber('table_roll'), anyNumber('table_roll')]);
  });

  it('lists one entry per row, in row order, with a random characteristic per increase', () => {
    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 101, source: 'chosen', isFreeExtra: false }),
          increase(),
          increase(),
        ],
        skillCategories: new Map([[101, 'general']]),
        positionAccess: new Map([['general', 'primary']]),
      }),
    );

    expect(result).toEqual([
      anyNumber('chosen_primary_skill'),
      anyNumber('random_characteristic'),
      anyNumber('random_characteristic'),
    ]);
  });

  it("pins a skill a league cost row grants to that row's number", () => {
    const fanFavourite: ApplicableAdvancementCost = {
      advancementNumber: 7,
      advancementKind: 'granted_skill',
      skillId: 500,
      sppCost: 125,
    };

    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 500, source: 'advancement', isFreeExtra: false }),
        ],
        costs: [...FIXED, fanFavourite],
      }),
    );

    expect(result).toEqual([
      [{ advancementKind: 'granted_skill', advancementNumber: 7 }],
    ]);
  });

  it('offers each number at which a cost row grants the skill', () => {
    const grantedAt = (
      advancementNumber: number,
    ): ApplicableAdvancementCost => ({
      advancementNumber,
      advancementKind: 'granted_skill',
      skillId: 500,
      sppCost: 125,
    });

    const result = service.candidates(
      input({
        skills: [
          gained({ skillId: 500, source: 'advancement', isFreeExtra: false }),
        ],
        costs: [...FIXED, grantedAt(7), grantedAt(8)],
      }),
    );

    expect(result).toEqual([
      [
        { advancementKind: 'granted_skill', advancementNumber: 7 },
        { advancementKind: 'granted_skill', advancementNumber: 8 },
      ],
    ]);
  });

  it.each([
    ['BB2020', BB2020],
    ['BB2025', BB2025],
  ])(
    'drops table_roll for a characteristic increase under %s',
    (_name, rulesSetCosts) => {
      const result = service.candidates(
        input({ skills: [increase()], costs: rulesSetCosts }),
      );

      expect(result).toEqual([anyNumber('random_characteristic')]);
    },
  );

  it('classifies a characteristic row as a characteristic advancement of any number', () => {
    expect(
      service.candidates(
        input({
          skills: [increase()],
          costs: [cost(1, 'random_characteristic'), cost(1, 'table_roll')],
        }),
      ),
    ).toEqual([
      [
        { advancementKind: 'random_characteristic', advancementNumber: null },
        { advancementKind: 'table_roll', advancementNumber: null },
      ],
    ]);
  });

  it('pins a confirmed entry to its recorded order', () => {
    expect(
      service.candidates(
        input({
          skills: [increase({ advancementOrder: 2, orderConfirmed: true })],
          costs: [
            cost(1, 'random_characteristic'),
            cost(2, 'random_characteristic'),
          ],
        }),
      ),
    ).toEqual([
      [{ advancementKind: 'random_characteristic', advancementNumber: 2 }],
    ]);
  });

  it('ignores the order of an unconfirmed entry', () => {
    expect(
      service.candidates(
        input({
          skills: [increase({ advancementOrder: 2 })],
          costs: [cost(1, 'random_characteristic')],
        }),
      ),
    ).toEqual([
      [{ advancementKind: 'random_characteristic', advancementNumber: null }],
    ]);
  });

  it('pins a confirmed skill to its recorded order', () => {
    expect(
      service.candidates(
        input({
          skills: [
            gained({
              source: 'chosen',
              advancementOrder: 3,
              orderConfirmed: true,
            }),
          ],
          skillCategories: new Map([[101, 'general']]),
          positionAccess: new Map([['general', 'primary']]),
        }),
      ),
    ).toEqual([
      [{ advancementKind: 'chosen_primary_skill', advancementNumber: 3 }],
    ]);
  });

  it('keeps a granted-skill option whose number matches a confirmed order', () => {
    expect(
      service.candidates(
        input({
          skills: [
            gained({ skillId: 9, advancementOrder: 7, orderConfirmed: true }),
          ],
          costs: [
            {
              advancementNumber: 7,
              advancementKind: 'granted_skill',
              skillId: 9,
              sppCost: 125,
            },
          ],
        }),
      ),
    ).toEqual([[{ advancementKind: 'granted_skill', advancementNumber: 7 }]]);
  });

  it('drops a granted-skill option whose number disagrees with a confirmed order', () => {
    expect(
      service.candidates(
        input({
          skills: [
            gained({ skillId: 9, advancementOrder: 3, orderConfirmed: true }),
          ],
          costs: [
            {
              advancementNumber: 7,
              advancementKind: 'granted_skill',
              skillId: 9,
              sppCost: 125,
            },
          ],
        }),
      ),
    ).toEqual([[]]);
  });

  it('skips a free extra skill even when its order is confirmed', () => {
    expect(
      service.candidates(
        input({
          skills: [
            gained({
              isFreeExtra: true,
              advancementOrder: 1,
              orderConfirmed: true,
            }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});
