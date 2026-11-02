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
      isFreeExtra: false,
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
        isFreeExtra: false,
      }).success,
    ).toBe(false);
  });

  it('accepts a free-extra flag on an entry and leaves it absent when omitted', () => {
    expect(
      PlayerSkillEntrySchema.parse({
        playerId: 1,
        skillId: 7,
        source: 'chosen',
        isFreeExtra: true,
      }).isFreeExtra,
    ).toBe(true);
    expect(
      PlayerSkillEntrySchema.parse({
        playerId: 1,
        skillId: 7,
        source: 'chosen',
      }),
    ).not.toHaveProperty('isFreeExtra');
  });

  it('rejects a non-boolean free-extra flag on an entry', () => {
    expect(
      PlayerSkillEntrySchema.safeParse({
        playerId: 1,
        skillId: 7,
        source: 'chosen',
        isFreeExtra: 'yes',
      }).success,
    ).toBe(false);
  });

  it('requires the free-extra flag on a read-back row', () => {
    expect(
      PlayerSkillRefSchema.safeParse({
        skillId: 7,
        source: 'chosen',
        attributeValue: null,
        advancementOrder: 1,
      }).success,
    ).toBe(false);
  });

  describe('characteristic entries', () => {
    const base = {
      playerId: 1,
      source: 'characteristic' as const,
      characteristic: 'AG' as const,
    };

    it('parses a characteristic entry with an order', () => {
      expect(
        PlayerSkillEntrySchema.parse({ ...base, advancementOrder: 3 }),
      ).toEqual({ ...base, advancementOrder: 3 });
    });

    it('parses a confirmed order', () => {
      expect(
        PlayerSkillEntrySchema.parse({
          ...base,
          advancementOrder: 3,
          orderConfirmed: true,
        }).orderConfirmed,
      ).toBe(true);
    });

    it.each([
      [
        'a characteristic with a skill source',
        { playerId: 1, skillId: 7, source: 'chosen', characteristic: 'AG' },
      ],
      [
        'the characteristic source without a characteristic',
        { playerId: 1, source: 'characteristic' },
      ],
      ['the characteristic source with a skill', { ...base, skillId: 7 }],
      ['a skill source without a skill', { playerId: 1, source: 'chosen' }],
      [
        'a characteristic entry with a variant',
        { ...base, attributeValue: 'x' },
      ],
      ['a characteristic entry flagged free', { ...base, isFreeExtra: true }],
      ['a confirmed entry without an order', { ...base, orderConfirmed: true }],
      [
        'a confirmed entry with a null order',
        { ...base, advancementOrder: null, orderConfirmed: true },
      ],
      ['an unknown characteristic', { ...base, characteristic: 'XX' }],
    ])('rejects %s', (_label, input) => {
      expect(PlayerSkillEntrySchema.safeParse(input).success).toBe(false);
    });
  });

  it('accepts the players whose characteristic increases a batch states in full', () => {
    expect(
      SyncPlayerSkillsSchema.parse({
        entries: [],
        characteristicPlayerIds: [1, 2],
      }).characteristicPlayerIds,
    ).toEqual([1, 2]);
  });

  it('parses the list input', () => {
    expect(
      ListPlayerSkillsSchema.parse({ playerId: 1, rulesSetId: 3 }),
    ).toEqual({
      playerId: 1,
      rulesSetId: 3,
    });
  });

  it('rejects a list input with no rulesSetId', () => {
    expect(ListPlayerSkillsSchema.safeParse({ playerId: 1 }).success).toBe(
      false,
    );
  });

  it('rejects a list input with a non-integer rulesSetId', () => {
    expect(
      ListPlayerSkillsSchema.safeParse({ playerId: 1, rulesSetId: 3.5 })
        .success,
    ).toBe(false);
  });
});
