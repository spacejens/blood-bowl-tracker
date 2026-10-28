import { ADVANCEMENT_KINDS } from '@blood-bowl-tracker/domain-enums';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { advancementCosts, advancementKindEnum } from './advancement-costs';
import { rulesSets } from './rules-sets';

describe('advancement_costs', () => {
  const config = getTableConfig(advancementCosts);

  it('lives in the game_data schema under its own name', () => {
    expect(config.schema).toBe('game_data');
    expect(config.name).toBe('advancement_costs');
  });

  it('has non-null integer rules set, number and cost columns and a non-null kind', () => {
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('rules_set_id')?.notNull).toBe(true);
    expect(byName.get('advancement_number')?.notNull).toBe(true);
    expect(byName.get('advancement_kind')?.notNull).toBe(true);
    expect(byName.get('spp_cost')?.notNull).toBe(true);
    expect(byName.get('advancement_number')?.getSQLType()).toBe('integer');
    expect(byName.get('spp_cost')?.getSQLType()).toBe('integer');
  });

  it('uses the shared domain-enums advancement kind list', () => {
    expect(advancementKindEnum.enumName).toBe('advancement_kind');
    expect(advancementKindEnum.enumValues).toEqual(ADVANCEMENT_KINDS);
  });

  it('references rules_sets', () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'rules_set_id'),
    );
    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(rulesSets);
  });

  it('is unique on (rules_set_id, advancement_number, advancement_kind)', () => {
    const constraint = config.uniqueConstraints.find(
      (c) => c.name === 'advancement_costs_rules_set_number_kind_unique',
    );
    expect(constraint).toBeDefined();
    expect(constraint!.columns.map((c) => c.name)).toEqual([
      'rules_set_id',
      'advancement_number',
      'advancement_kind',
    ]);
  });

  it('checks that the advancement number and the SPP cost are positive', () => {
    const names = config.checks.map((c) => c.name);
    expect(names).toContain('advancement_costs_advancement_number_positive');
    expect(names).toContain('advancement_costs_spp_cost_positive');
  });
});
