import { describe, expect, it } from 'vitest';

import { SkillSchema, UpsertSkillSchema } from './skill';

describe('skill schemas', () => {
  it('parses a stored skill', () => {
    const parsed = SkillSchema.parse({
      id: 7,
      name: 'Block',
      createdAt: new Date('2026-01-01'),
    });
    expect(parsed.name).toBe('Block');
  });

  it('requires at least one external ID when upserting a skill', () => {
    expect(
      UpsertSkillSchema.safeParse({ name: 'Block', externalIds: [] }).success,
    ).toBe(false);
  });

  it('allows an upsert that says nothing about the name', () => {
    expect(
      UpsertSkillSchema.safeParse({
        externalIds: [{ externalSystemId: 1, externalId: 'Name: Block' }],
      }).success,
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(
      UpsertSkillSchema.safeParse({
        name: '',
        externalIds: [{ externalSystemId: 1, externalId: 'Name: Block' }],
      }).success,
    ).toBe(false);
  });
});
