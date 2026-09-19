import { describe, expect, it } from 'vitest';

import {
  ListPlayerSkillsSchema,
  PlayerSkillEntrySchema,
  PlayerSkillRefSchema,
  SyncPlayerSkillsResultSchema,
  SyncPlayerSkillsSchema,
} from './player-skill';

describe('player skill schemas', () => {
  it('parses a minimal starting-skill entry', () => {
    const parsed = PlayerSkillEntrySchema.parse({
      playerId: 1,
      skillId: 7,
      source: 'starting',
    });
    expect(parsed).toEqual({ playerId: 1, skillId: 7, source: 'starting' });
  });

  it('parses a gained entry with a variant and an order', () => {
    const parsed = PlayerSkillEntrySchema.parse({
      playerId: 1,
      skillId: 7,
      source: 'chosen',
      attributeValue: 'Orc',
      advancementOrder: 2,
    });
    expect(parsed.attributeValue).toBe('Orc');
    expect(parsed.advancementOrder).toBe(2);
  });

  it('parses an advancement entry whose chosen/random split is unknown', () => {
    const parsed = PlayerSkillEntrySchema.parse({
      playerId: 1,
      skillId: 2,
      source: 'advancement',
      advancementOrder: 1,
    });
    expect(parsed.source).toBe('advancement');
    expect(parsed.advancementOrder).toBe(1);
  });

  it('accepts an explicit null for both nullable fields', () => {
    const parsed = PlayerSkillEntrySchema.parse({
      playerId: 1,
      skillId: 7,
      source: 'random',
      attributeValue: null,
      advancementOrder: null,
    });
    expect(parsed.attributeValue).toBeNull();
    expect(parsed.advancementOrder).toBeNull();
  });

  it('rejects a source outside the domain enum', () => {
    expect(
      PlayerSkillEntrySchema.safeParse({
        playerId: 1,
        skillId: 7,
        source: 'inherited',
      }).success,
    ).toBe(false);
  });

  it('rejects a negative advancement order', () => {
    expect(
      PlayerSkillEntrySchema.safeParse({
        playerId: 1,
        skillId: 7,
        source: 'chosen',
        advancementOrder: -1,
      }).success,
    ).toBe(false);
  });

  it('rejects a starting entry with a numeric advancement order', () => {
    expect(
      PlayerSkillEntrySchema.safeParse({
        playerId: 1,
        skillId: 7,
        source: 'starting',
        advancementOrder: 2,
      }).success,
    ).toBe(false);
  });

  it('accepts a starting entry with an explicit null advancement order', () => {
    expect(
      PlayerSkillEntrySchema.safeParse({
        playerId: 1,
        skillId: 7,
        source: 'starting',
        advancementOrder: null,
      }).success,
    ).toBe(true);
  });

  it('parses an empty sync batch and its result', () => {
    expect(SyncPlayerSkillsSchema.parse({ entries: [] })).toEqual({
      entries: [],
    });
    expect(
      SyncPlayerSkillsResultSchema.parse({ playerSkillIds: [51, 52] }),
    ).toEqual({ playerSkillIds: [51, 52] });
  });

  it('parses a read-back row, which carries no playerId', () => {
    const parsed = PlayerSkillRefSchema.parse({
      skillId: 7,
      source: 'starting',
      attributeValue: null,
      advancementOrder: null,
    });
    expect(parsed).not.toHaveProperty('playerId');
  });

  it('requires a null rather than an omitted field on a read-back row', () => {
    expect(
      PlayerSkillRefSchema.safeParse({ skillId: 7, source: 'starting' })
        .success,
    ).toBe(false);
  });

  it('rejects a negative advancement order on a read-back row', () => {
    expect(
      PlayerSkillRefSchema.safeParse({
        skillId: 7,
        source: 'chosen',
        attributeValue: null,
        advancementOrder: -1,
      }).success,
    ).toBe(false);
  });

  it('parses the list input', () => {
    expect(ListPlayerSkillsSchema.parse({ playerId: 1 })).toEqual({
      playerId: 1,
    });
  });
});
