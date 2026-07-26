import { describe, expect, it } from 'vitest';

import { RulesSetSchema, UpsertRulesSetSchema } from './rules-set';

describe('rules set schemas', () => {
  it('RulesSetSchema parses a valid rules set', () => {
    const parsed = RulesSetSchema.parse({
      id: 1,
      name: 'BB2020',
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
});
