import { describe, expect, it } from 'vitest';

import { KEYWORD_KINDS } from './keywords';

describe('KEYWORD_KINDS', () => {
  it('lists every keyword kind in schema order', () => {
    expect(KEYWORD_KINDS).toEqual(['species', 'positional', 'special']);
  });

  it('has no duplicate values', () => {
    expect(new Set(KEYWORD_KINDS).size).toBe(KEYWORD_KINDS.length);
  });
});
