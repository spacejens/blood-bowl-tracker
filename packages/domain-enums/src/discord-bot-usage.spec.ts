import { describe, expect, expectTypeOf, it } from 'vitest';

import type { InteractionKind, InteractionOutcome } from './discord-bot-usage';
import { INTERACTION_KINDS, INTERACTION_OUTCOMES } from './discord-bot-usage';

describe('INTERACTION_KINDS', () => {
  it('lists every tracked interaction kind in schema order', () => {
    expect(INTERACTION_KINDS).toEqual(['command', 'button', 'select_menu']);
  });

  it('has no duplicate values', () => {
    expect(new Set(INTERACTION_KINDS).size).toBe(INTERACTION_KINDS.length);
  });

  it('types InteractionKind as exactly its listed values', () => {
    expectTypeOf<InteractionKind>().toEqualTypeOf<
      'command' | 'button' | 'select_menu'
    >();
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

  it('types InteractionOutcome as exactly its listed values', () => {
    expectTypeOf<InteractionOutcome>().toEqualTypeOf<'success' | 'failure'>();
  });
});
