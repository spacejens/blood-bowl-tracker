import { describe, expect, expectTypeOf, it } from 'vitest';

import type { KeywordKind } from './keywords';
import { KEYWORD_KINDS } from './keywords';

describe('KEYWORD_KINDS', () => {
  it('lists every keyword kind in schema order', () => {
    expect(KEYWORD_KINDS).toEqual(['species', 'positional', 'special']);
  });

  it('has no duplicate values', () => {
    expect(new Set(KEYWORD_KINDS).size).toBe(KEYWORD_KINDS.length);
  });

  it('types KeywordKind as exactly its listed values', () => {
    expectTypeOf<KeywordKind>().toEqualTypeOf<
      'species' | 'positional' | 'special'
    >();
  });
});
