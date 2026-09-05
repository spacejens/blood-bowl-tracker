import { describe, expect, it } from 'vitest';

import {
  mercenaryCharacteristicsEntrySchema,
  mercenaryCharacteristicsShellSchema,
} from './mercenary-characteristics-config.schema';

const VALID = {
  positionName: 'Giant Mercenary',
  rulesSetName: 'BB2020',
  move: 6,
  strength: 7,
  agility: 5,
  passing: 5,
  armour: 11,
};

describe('mercenaryCharacteristicsShellSchema', () => {
  it('accepts an array (including empty), leaving the entries unparsed', () => {
    expect(mercenaryCharacteristicsShellSchema.parse([VALID, 7])).toEqual([
      VALID,
      7,
    ]);
    expect(mercenaryCharacteristicsShellSchema.parse([])).toEqual([]);
  });

  it('rejects a non-array', () => {
    const result = mercenaryCharacteristicsShellSchema.safeParse('nope');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'must be an array of mercenary characteristics entries.',
    );
  });
});

describe('mercenaryCharacteristicsEntrySchema', () => {
  it('accepts a complete entry', () => {
    const parsed = mercenaryCharacteristicsEntrySchema.parse(VALID);
    expect(parsed).toEqual(VALID);
  });

  it('rejects a non-object at the root', () => {
    const result = mercenaryCharacteristicsEntrySchema.safeParse(7);
    expect(result.error?.issues[0].path).toEqual([]);
    expect(result.error?.issues[0].message).toBe('must be an object.');
  });

  it('rejects a blank positionName', () => {
    const result = mercenaryCharacteristicsEntrySchema.safeParse({
      ...VALID,
      positionName: '',
    });
    expect(result.error?.issues[0].path).toEqual(['positionName']);
    expect(result.error?.issues[0].message).toBe('must be a non-empty string.');
  });

  it('rejects a blank rulesSetName', () => {
    const result = mercenaryCharacteristicsEntrySchema.safeParse({
      ...VALID,
      rulesSetName: '  ',
    });
    expect(result.error?.issues[0].path).toEqual(['rulesSetName']);
  });

  it.each(['move', 'strength', 'agility', 'armour'] as const)(
    'rejects a non-number %s',
    (field) => {
      const result = mercenaryCharacteristicsEntrySchema.safeParse({
        ...VALID,
        [field]: 'six',
      });
      expect(result.error?.issues[0].path).toEqual([field]);
      expect(result.error?.issues[0].message).toBe(
        'must be a positive whole number.',
      );
    },
  );

  it('rejects a non-number passing', () => {
    const result = mercenaryCharacteristicsEntrySchema.safeParse({
      ...VALID,
      passing: 'six',
    });
    expect(result.error?.issues[0].path).toEqual(['passing']);
    expect(result.error?.issues[0].message).toBe(
      'must be a whole number, zero or greater.',
    );
  });

  it.each(['move', 'strength', 'agility', 'armour'] as const)(
    'rejects zero, a negative value, and a fraction for %s -- 0 is not a legal value under any rules set',
    (field) => {
      for (const value of [0, -1, 5.5]) {
        const result = mercenaryCharacteristicsEntrySchema.safeParse({
          ...VALID,
          [field]: value,
        });
        expect(result.success).toBe(false);
      }
    },
  );

  it('accepts zero for passing -- a structurally-unable-to-pass mercenary is a legitimate value', () => {
    expect(
      mercenaryCharacteristicsEntrySchema.parse({ ...VALID, passing: 0 })
        .passing,
    ).toBe(0);
  });

  it('rejects a negative value and a fraction for passing', () => {
    for (const value of [-1, 5.5]) {
      const result = mercenaryCharacteristicsEntrySchema.safeParse({
        ...VALID,
        passing: value,
      });
      expect(result.success).toBe(false);
    }
  });
});
