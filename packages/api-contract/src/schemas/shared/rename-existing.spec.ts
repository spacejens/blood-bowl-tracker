import { describe, expect, it } from 'vitest';

import { RenameExistingSchema } from './rename-existing';

describe('RenameExistingSchema', () => {
  it('accepts true, false and an omitted value', () => {
    expect(RenameExistingSchema.parse(true)).toBe(true);
    expect(RenameExistingSchema.parse(false)).toBe(false);
    expect(RenameExistingSchema.parse(undefined)).toBeUndefined();
  });

  it('rejects a non-boolean', () => {
    expect(RenameExistingSchema.safeParse('yes').success).toBe(false);
  });
});
