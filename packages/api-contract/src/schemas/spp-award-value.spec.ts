import { describe, expect, it } from 'vitest';

import { ActionTypeSchema } from './match-event';
import {
  SppAwardValueEntrySchema,
  SppEarningActionTypeSchema,
  SyncSppAwardValuesResultSchema,
  SyncSppAwardValuesSchema,
} from './spp-award-value';

describe('SppEarningActionTypeSchema', () => {
  it('lists exactly the action types that earn SPP', () => {
    expect([...SppEarningActionTypeSchema.options].sort()).toEqual(
      [
        'badly_hurt',
        'casualty',
        'completion',
        'death',
        'deflection',
        'interception',
        'mvp_award',
        'serious_injury',
        'touchdown',
      ].sort(),
    );
  });

  it('is a strict subset of the action_type enum', () => {
    const all = new Set<string>(ActionTypeSchema.options);
    for (const value of SppEarningActionTypeSchema.options) {
      expect(all.has(value)).toBe(true);
    }
    expect(SppEarningActionTypeSchema.options).not.toContain('foul');
  });
});

describe('SppAwardValueEntrySchema', () => {
  it('accepts a baseline entry with a null raceId', () => {
    expect(
      SppAwardValueEntrySchema.parse({
        rulesSetId: 1,
        raceId: null,
        actionType: 'touchdown',
        sppValue: 3,
      }),
    ).toEqual({
      rulesSetId: 1,
      raceId: null,
      actionType: 'touchdown',
      sppValue: 3,
    });
  });

  it('accepts a race-specific override entry', () => {
    expect(
      SppAwardValueEntrySchema.parse({
        rulesSetId: 1,
        raceId: 7,
        actionType: 'touchdown',
        sppValue: 2,
      }).raceId,
    ).toBe(7);
  });

  it('rejects an action type that earns no SPP', () => {
    expect(() =>
      SppAwardValueEntrySchema.parse({
        rulesSetId: 1,
        raceId: null,
        actionType: 'foul',
        sppValue: 0,
      }),
    ).toThrow();
  });

  it('requires raceId to be present, even when null', () => {
    expect(() =>
      SppAwardValueEntrySchema.parse({
        rulesSetId: 1,
        actionType: 'touchdown',
        sppValue: 3,
      }),
    ).toThrow();
  });
});

describe('SyncSppAwardValuesSchema', () => {
  it('accepts an empty values list', () => {
    expect(SyncSppAwardValuesSchema.parse({ values: [] })).toEqual({
      values: [],
    });
  });

  it('parses a result of synced ids', () => {
    expect(
      SyncSppAwardValuesResultSchema.parse({ sppAwardValueIds: [1, 2] }),
    ).toEqual({ sppAwardValueIds: [1, 2] });
  });
});
