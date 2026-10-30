import type { AdvancementKind } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AdvancementHistory,
  ApplicableCost,
  StoredPlayerSkill,
  UnknownRangeReason,
} from './advancement-cost-model.types';
import { AdvancementCostRangeService } from './advancement-cost-range.service';

function cost(
  advancementNumber: number,
  advancementKind: AdvancementKind,
  sppCost: number,
): ApplicableCost {
  return {
    advancementNumber,
    advancementKind,
    skillId: null,
    sppCost,
    leagueId: null,
  };
}

function series(kind: AdvancementKind, costs: number[]): ApplicableCost[] {
  return costs.map((sppCost, index) => cost(index + 1, kind, sppCost));
}

const CRP = series('table_roll', [6, 10, 15, 20, 25, 100]);
const BB2020 = [
  ...series('random_primary_skill', [3, 4, 6, 8, 10, 15]),
  ...series('chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
  ...series('random_secondary_skill', [6, 8, 12, 16, 20, 30]),
  ...series('chosen_secondary_skill', [12, 14, 18, 22, 26, 40]),
  ...series('random_characteristic', [18, 20, 24, 28, 32, 50]),
];
const FAN_FAVOURITE_ID = 99;
const FAN_FAVOURITE: ApplicableCost = {
  ...cost(7, 'granted_skill', 125),
  skillId: FAN_FAVOURITE_ID,
  leagueId: 5,
};

/** Default ids per name, unique across the names these specs use. */
const SKILL_IDS: Readonly<Record<string, number>> = {
  Block: 1,
  Dodge: 2,
  Guard: 3,
};

function skill(
  skillName: string,
  source: StoredPlayerSkill['source'],
  skillId = SKILL_IDS[skillName],
): StoredPlayerSkill {
  return {
    skillId,
    skillName,
    source,
    advancementOrder: source === 'starting' ? null : 1,
  };
}

function history(overrides: Partial<AdvancementHistory>): AdvancementHistory {
  return {
    playerId: 42,
    sppTotal: 40,
    isStarPlayer: false,
    rulesSet: { id: 1, name: 'CRP' },
    skills: [],
    trophyGrantedSkillIds: new Set<number>(),
    increaseCounts: { move: 0, strength: 0, agility: 0, passing: 0, armour: 0 },
    costs: CRP,
    ...overrides,
  };
}

describe('AdvancementCostRangeService', () => {
  let service: AdvancementCostRangeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AdvancementCostRangeService],
    }).compile();
    service = moduleRef.get(AdvancementCostRangeService);
  });

  it('prices fixed-threshold advancements exactly, skills then increases', () => {
    const model = service.model(
      history({
        skills: [skill('Block', 'advancement'), skill('Dodge', 'advancement')],
        increaseCounts: {
          move: 1,
          strength: 0,
          agility: 0,
          passing: 0,
          armour: 0,
        },
      }),
    );

    expect(model.fixedThresholds).toBe(true);
    expect(model.rows.map((row) => [row.label, row.advancementNumber])).toEqual(
      [
        ['Block', 1],
        ['Dodge', 2],
        ['+MA', 3],
      ],
    );
    expect(model.rows[2].candidates).toEqual([
      { advancementKind: 'table_roll', sppCost: 15 },
    ]);
    expect(model.range).toEqual({
      spentMin: 31,
      spentMax: 31,
      unspentMin: 9,
      unspentMax: 9,
    });
    expect(model.unknownReason).toBeNull();
  });

  it('narrows a kind-priced row to random or chosen by stored source', () => {
    const model = service.model(
      history({
        rulesSet: { id: 2, name: 'BB2020' },
        costs: BB2020,
        sppTotal: 30,
        skills: [skill('Guard', 'random'), skill('Block', 'chosen')],
      }),
    );

    expect(model.fixedThresholds).toBe(false);
    expect(model.rows[0].candidates).toEqual([
      { advancementKind: 'random_primary_skill', sppCost: 3 },
      { advancementKind: 'random_secondary_skill', sppCost: 6 },
    ]);
    expect(model.rows[1].candidates).toEqual([
      { advancementKind: 'chosen_primary_skill', sppCost: 8 },
      { advancementKind: 'chosen_secondary_skill', sppCost: 14 },
      { advancementKind: 'random_characteristic', sppCost: 20 },
    ]);
    // Any order, any kind: #1 is 3..18 and #2 is 4..20 over the union.
    expect(model.range).toEqual({
      spentMin: 7,
      spentMax: 38,
      unspentMin: -8,
      unspentMax: 23,
    });
  });

  it('allows a chosen skill to have been a characteristic roll taken as a skill', () => {
    const model = service.model(
      history({
        rulesSet: { id: 2, name: 'BB2020' },
        costs: BB2020,
        sppTotal: 30,
        skills: [skill('Block', 'chosen')],
      }),
    );

    expect(model.rows[0].candidates).toEqual([
      { advancementKind: 'chosen_primary_skill', sppCost: 6 },
      { advancementKind: 'chosen_secondary_skill', sppCost: 12 },
      { advancementKind: 'random_characteristic', sppCost: 18 },
    ]);
    expect(model.range).toEqual({
      spentMin: 6,
      spentMax: 18,
      unspentMin: 12,
      unspentMax: 24,
    });
  });

  it('never prices a random skill as a characteristic roll', () => {
    const model = service.model(
      history({
        rulesSet: { id: 2, name: 'BB2020' },
        costs: BB2020,
        sppTotal: 30,
        skills: [skill('Guard', 'random')],
      }),
    );

    expect(model.range).toEqual({
      spentMin: 3,
      spentMax: 6,
      unspentMin: 24,
      unspentMax: 27,
    });
  });

  it('prices a chosen skill as a table roll under fixed thresholds', () => {
    const model = service.model(
      history({ skills: [skill('Block', 'chosen')] }),
    );

    expect(model.rows[0].candidates).toEqual([
      { advancementKind: 'table_roll', sppCost: 6 },
    ]);
    expect(model.range?.spentMax).toBe(6);
  });

  it('models the whole total as unspent with no paid advancements', () => {
    const model = service.model(
      history({ skills: [skill('Block', 'starting')] }),
    );

    expect(model.range).toEqual({
      spentMin: 0,
      spentMax: 0,
      unspentMin: 40,
      unspentMax: 40,
    });
  });

  it('does not treat a set with only a league granted_skill row as fixed thresholds', () => {
    const model = service.model(history({ costs: [FAN_FAVOURITE] }));

    expect(model.fixedThresholds).toBe(false);
    expect(model.range).toEqual({
      spentMin: 0,
      spentMax: 0,
      unspentMin: 40,
      unspentMax: 40,
    });
  });

  it('offers every skill kind and a characteristic roll for an ambiguous gained skill', () => {
    const model = service.model(
      history({
        rulesSet: { id: 2, name: 'BB2020' },
        costs: BB2020,
        skills: [skill('Guard', 'advancement')],
      }),
    );

    expect(model.rows[0].candidates.map((c) => c.advancementKind)).toEqual([
      'random_primary_skill',
      'chosen_primary_skill',
      'random_secondary_skill',
      'chosen_secondary_skill',
      'random_characteristic',
    ]);
  });

  it('prices a characteristic increase as a random characteristic roll', () => {
    const model = service.model(
      history({
        rulesSet: { id: 2, name: 'BB2020' },
        costs: BB2020,
        skills: [skill('Guard', 'random')],
        increaseCounts: {
          move: 0,
          strength: 1,
          agility: 0,
          passing: 0,
          armour: 0,
        },
      }),
    );

    expect(model.rows[1]).toEqual({
      label: '+ST',
      kind: 'characteristic',
      storedSource: null,
      advancementNumber: 2,
      candidates: [{ advancementKind: 'random_characteristic', sppCost: 20 }],
    });
    expect(model.range).toEqual({
      spentMin: 7,
      spentMax: 38,
      unspentMin: 2,
      unspentMax: 33,
    });
  });

  it('makes starting skills and a trophy mutation free and unnumbered', () => {
    const model = service.model(
      history({
        skills: [
          skill('Block', 'starting', 1),
          skill('Tentacles', 'chosen', 2),
          skill('Guard', 'random', 3),
        ],
        trophyGrantedSkillIds: new Set([2]),
      }),
    );

    expect(model.rows.map((row) => [row.kind, row.advancementNumber])).toEqual([
      ['starting', null],
      ['trophy', null],
      ['skill', 1],
    ]);
    expect(model.range?.spentMin).toBe(6);
    expect(model.range?.spentMax).toBe(6);
  });

  it('prices a league house-rule skill at its own number', () => {
    const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((name, index) =>
      skill(name, 'advancement', index + 10),
    );
    const model = service.model(
      history({
        sppTotal: 320,
        costs: [...CRP, FAN_FAVOURITE],
        skills: [
          ...six,
          skill('Fan Favourite', 'advancement', FAN_FAVOURITE_ID),
        ],
      }),
    );

    expect(model.rows[6]).toEqual({
      label: 'Fan Favourite',
      kind: 'granted',
      storedSource: 'advancement',
      advancementNumber: 7,
      candidates: [{ advancementKind: 'granted_skill', sppCost: 125 }],
    });
    expect(model.range).toEqual({
      spentMin: 301,
      spentMax: 301,
      unspentMin: 19,
      unspentMax: 19,
    });
  });

  it('keeps the house-rule number when fewer advancements were recorded', () => {
    const model = service.model(
      history({
        sppTotal: 400,
        costs: [...CRP, FAN_FAVOURITE],
        skills: [
          skill('A', 'advancement', 10),
          skill('Fan Favourite', 'advancement', FAN_FAVOURITE_ID),
        ],
      }),
    );

    expect(model.rows.map((row) => row.advancementNumber)).toEqual([1, 7]);
    expect(model.range?.spentMin).toBe(131);
  });

  it('gives no range when an advancement number has no cost row', () => {
    const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name, index) =>
      skill(name, 'advancement', index + 10),
    );
    const model = service.model(history({ sppTotal: 400, skills: seven }));

    expect(model.rows[6].candidates).toEqual([]);
    expect(model.range).toBeNull();
    expect(model.unknownReason).toBe('unpriced_advancement');
  });

  it.each<[Partial<AdvancementHistory>, UnknownRangeReason]>([
    [{ isStarPlayer: true }, 'star_player'],
    [{ sppTotal: null }, 'no_total_spp'],
    [{ rulesSet: null }, 'no_rules_set'],
    [{ costs: [] }, 'no_costs'],
  ])('gives no range for %o', (overrides, reason) => {
    const model = service.model(history(overrides));

    expect(model.range).toBeNull();
    expect(model.unknownReason).toBe(reason);
  });

  it('builds no rows when the era has no rules set', () => {
    const model = service.model(
      history({ rulesSet: null, skills: [skill('Block', 'chosen')] }),
    );

    expect(model.rows).toEqual([]);
    expect(model.rulesSetName).toBeNull();
  });
});
