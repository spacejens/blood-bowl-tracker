import { describe, expect, it } from 'vitest';

import { EXTERNAL_SYSTEM_CATEGORIES } from './external-systems';

describe('EXTERNAL_SYSTEM_CATEGORIES', () => {
  it('lists every external system category in schema order', () => {
    expect(EXTERNAL_SYSTEM_CATEGORIES).toEqual([
      'bookkeeping',
      'imported_data_source',
      'referenced_not_imported',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(EXTERNAL_SYSTEM_CATEGORIES).size).toBe(
      EXTERNAL_SYSTEM_CATEGORIES.length,
    );
  });
});
