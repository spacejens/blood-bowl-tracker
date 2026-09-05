import { describe, expect, it } from 'vitest';

import {
  CharacteristicFormatSchema,
  RulesSetSchema,
  UpsertRulesSetSchema,
} from './rules-set';

describe('rules set schemas', () => {
  it('RulesSetSchema parses a valid rules set', () => {
    const parsed = RulesSetSchema.parse({
      id: 1,
      name: 'BB2020',
      moveFormat: 'bare',
      strengthFormat: 'bare',
      agilityFormat: 'plus',
      passingFormat: 'plus',
      armourFormat: 'plus',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.name).toBe('BB2020');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('UpsertRulesSetSchema rejects an empty name', () => {
    expect(() =>
      UpsertRulesSetSchema.parse({
        name: '',
        externalIds: [{ externalSystemId: 1, externalId: 'x' }],
      }),
    ).toThrow();
  });

  it('UpsertRulesSetSchema rejects an empty externalIds array', () => {
    expect(() =>
      UpsertRulesSetSchema.parse({ name: 'X', externalIds: [] }),
    ).toThrow();
  });

  it('UpsertRulesSetSchema accepts an externalIds-only payload', () => {
    const parsed = UpsertRulesSetSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.name).toBeUndefined();
  });

  it('CharacteristicFormatSchema accepts exactly the four formats', () => {
    expect(CharacteristicFormatSchema.options).toEqual([
      'absent',
      'bare',
      'plus',
      'plus_zero_legal',
    ]);
    expect(() => CharacteristicFormatSchema.parse('plus')).not.toThrow();
    expect(() =>
      CharacteristicFormatSchema.parse('plus_zero_legal'),
    ).not.toThrow();
    expect(() => CharacteristicFormatSchema.parse('star')).toThrow();
  });

  it('RulesSetSchema requires all five characteristic formats', () => {
    const parsed = RulesSetSchema.parse({
      id: 1,
      name: 'BB2020',
      moveFormat: 'bare',
      strengthFormat: 'bare',
      agilityFormat: 'plus',
      passingFormat: 'plus',
      armourFormat: 'plus',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.agilityFormat).toBe('plus');
    expect(() =>
      RulesSetSchema.parse({
        id: 1,
        name: 'BB2020',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('UpsertRulesSetSchema takes the formats as an optional overlay', () => {
    const parsed = UpsertRulesSetSchema.parse({
      passingFormat: 'absent',
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.passingFormat).toBe('absent');
    expect(parsed.moveFormat).toBeUndefined();
  });
});
