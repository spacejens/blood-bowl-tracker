import { describe, expect, it } from 'vitest';

import { INTERACTION_KINDS, INTERACTION_OUTCOMES } from './discord-bot-usage';

describe('INTERACTION_KINDS', () => {
  it('lists every tracked interaction kind in schema order', () => {
    expect(INTERACTION_KINDS).toEqual(['command', 'button', 'select_menu']);
  });

  it('has no duplicate values', () => {
    expect(new Set(INTERACTION_KINDS).size).toBe(INTERACTION_KINDS.length);
  });
});

describe('INTERACTION_OUTCOMES', () => {
  it('lists every recorded interaction outcome in schema order', () => {
    expect(INTERACTION_OUTCOMES).toEqual(['success', 'failure']);
  });

  it('has no duplicate values', () => {
    expect(new Set(INTERACTION_OUTCOMES).size).toBe(
      INTERACTION_OUTCOMES.length,
    );
  });
});
