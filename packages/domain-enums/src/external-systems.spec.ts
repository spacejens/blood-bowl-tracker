import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ExternalSystemCategory } from './external-systems';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  EXTERNAL_SYSTEM_CATEGORIES,
  TP_EXTERNAL_SYSTEM_NAME,
} from './external-systems';

describe('source external-system names', () => {
  it('names BBL after the league site the BBL data comes from', () => {
    expect(BBL_EXTERNAL_SYSTEM_NAME).toBe('tloeg.bbleague.se');
  });

  it('names TP after the site the TP data comes from', () => {
    expect(TP_EXTERNAL_SYSTEM_NAME).toBe('tourplay.net');
  });
});

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

  it('types ExternalSystemCategory as exactly its listed values', () => {
    expectTypeOf<ExternalSystemCategory>().toEqualTypeOf<
      'bookkeeping' | 'imported_data_source' | 'referenced_not_imported'
    >();
  });
});
