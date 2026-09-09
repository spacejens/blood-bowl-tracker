import { describe, expect, it } from 'vitest';

import { TROPHY_RECIPIENT_KINDS } from './trophies';

describe('TROPHY_RECIPIENT_KINDS', () => {
  it('lists every trophy recipient kind in schema order', () => {
    expect(TROPHY_RECIPIENT_KINDS).toEqual(['team', 'player']);
  });

  it('has no duplicate values', () => {
    expect(new Set(TROPHY_RECIPIENT_KINDS).size).toBe(
      TROPHY_RECIPIENT_KINDS.length,
    );
  });
});
