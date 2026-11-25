import type {
  AdvancementKind,
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';

import type {
  PricingCostRow,
  ReportedCharacteristicStep,
  ReportedSkillStep,
  RulesSetPricingInput,
} from './reported-pricing.types';

type CostTable = readonly (readonly [AdvancementKind, readonly number[]])[];

/** BB2020 and DB2021 (batch 004). */
export const BB2020_COSTS: CostTable = [
  ['random_primary_skill', [3, 4, 6, 8, 10, 15]],
  ['chosen_primary_skill', [6, 8, 12, 16, 20, 30]],
  ['random_secondary_skill', [6, 8, 12, 16, 20, 30]],
  ['chosen_secondary_skill', [12, 14, 18, 22, 26, 40]],
  ['random_characteristic', [18, 20, 24, 28, 32, 50]],
];

/** BB2025 (batch 004): no random secondary skill. */
export const BB2025_COSTS: CostTable = [
  ['random_primary_skill', [3, 4, 6, 8, 10, 15]],
  ['chosen_primary_skill', [6, 8, 12, 16, 20, 30]],
  ['chosen_secondary_skill', [10, 12, 16, 20, 24, 34]],
  ['random_characteristic', [14, 16, 20, 24, 28, 38]],
];

/** CRP, CRP+ and BB2016 fixed thresholds (batch 004). */
export const FIXED_COSTS: CostTable = [
  ['table_roll', [6, 10, 15, 20, 25, 100]],
];

/** The table's rows as a rules set's own cost rows. */
export function costRows(table: CostTable): PricingCostRow[] {
  return table.flatMap(([advancementKind, costs]) =>
    costs.map((sppCost, at) => ({
      leagueId: null,
      advancementNumber: at + 1,
      advancementKind,
      skillId: null,
      sppCost,
    })),
  );
}

/** A chosen primary skill 200 (an agility skill). */
export function skillStep(
  overrides: Partial<ReportedSkillStep> = {},
): ReportedSkillStep {
  return {
    kind: 'skill',
    skillId: 200,
    selection: 'chosen',
    category: 'primary',
    ...overrides,
  };
}

/** A random characteristic increase. */
export function increaseStep(
  overrides: Partial<ReportedCharacteristicStep> = {},
): ReportedCharacteristicStep {
  return { kind: 'characteristic', selection: 'random', ...overrides };
}

/**
 * Rules set 7 with the given costs. Skill 200 is agility and skill 201
 * strength; the position has agility as primary and strength as secondary.
 */
export function pricingInput(
  costs: readonly PricingCostRow[],
  overrides: Partial<RulesSetPricingInput> = {},
): RulesSetPricingInput {
  return {
    rulesSetId: 7,
    costs,
    skillCategories: new Map<number, SkillCategory>([
      [200, 'agility'],
      [201, 'strength'],
    ]),
    positionAccess: new Map<SkillCategory, SkillAccess>([
      ['agility', 'primary'],
      ['strength', 'secondary'],
    ]),
    ...overrides,
  };
}
