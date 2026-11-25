import { describe, expect, it } from 'vitest';

import {
  ExternalRefSchema,
  IncompletePlayerFillEntrySchema,
  LastingInjuryRepairEntrySchema,
  PositionRulesSetSkillRefSchema,
} from './manual-batch-schemas';

const validFill = {
  player: { system: 'tourplay.net', id: 'id:123' },
  status: 'active',
  characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 8 },
  sppTotal: 10,
  unspentSpp: 4,
  startingSkills: [{ system: 'Name', id: 'Block' }],
  advancements: [{ skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' }],
};

describe('manual batch schemas', () => {
  it('accepts a valid fill entry', () => {
    expect(IncompletePlayerFillEntrySchema.safeParse(validFill).success).toBe(
      true,
    );
  });

  it('accepts a fill entry with pa left out', () => {
    const { pa: _pa, ...characteristics } = validFill.characteristics;

    expect(
      IncompletePlayerFillEntrySchema.safeParse({
        ...validFill,
        characteristics,
      }).success,
    ).toBe(true);
  });

  it('rejects a fill entry with ma: 0', () => {
    expect(
      IncompletePlayerFillEntrySchema.safeParse({
        ...validFill,
        characteristics: { ...validFill.characteristics, ma: 0 },
      }).success,
    ).toBe(false);
  });

  it('rejects a repair entry with an extra key', () => {
    expect(
      LastingInjuryRepairEntrySchema.safeParse({
        player: validFill.player,
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it('accepts a repair entry with only a player', () => {
    expect(
      LastingInjuryRepairEntrySchema.safeParse({ player: validFill.player })
        .success,
    ).toBe(true);
  });

  it('rejects an external ref with an empty id', () => {
    expect(
      ExternalRefSchema.safeParse({ system: 'Name', id: '' }).success,
    ).toBe(false);
  });

  it('accepts a skill ref with and without an attribute value', () => {
    expect(
      PositionRulesSetSkillRefSchema.safeParse({ system: 'Name', id: 'Loner' })
        .success,
    ).toBe(true);
    expect(
      PositionRulesSetSkillRefSchema.safeParse({
        skill: { system: 'Name', id: 'Loner' },
        attributeValue: '4+',
      }).success,
    ).toBe(true);
  });
});
