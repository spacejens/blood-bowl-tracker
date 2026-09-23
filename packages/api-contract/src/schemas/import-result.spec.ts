import { describe, expect, it } from 'vitest';

import { ImportResultSchema } from './import-result';

describe('ImportResultSchema', () => {
  it('accepts a result carrying free-form error items', () => {
    expect(
      ImportResultSchema.safeParse({
        success: false,
        imported: 1,
        errors: [{ item: { rosterId: 7 }, message: 'boom' }],
      }).success,
    ).toBe(true);
  });

  it('rejects a result with a non-integer imported count', () => {
    expect(
      ImportResultSchema.safeParse({ success: true, imported: 1.5, errors: [] })
        .success,
    ).toBe(false);
  });

  it('rejects an error without a message', () => {
    expect(
      ImportResultSchema.safeParse({
        success: false,
        imported: 0,
        errors: [{ item: 1 }],
      }).success,
    ).toBe(false);
  });
});
