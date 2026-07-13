import { describe, expect, it } from 'vitest';

import { UpsertMatchEventSchema } from './match-event';

describe('UpsertMatchEventSchema', () => {
  const base = {
    matchId: 1,
    externalIds: [{ externalSystemId: 1, externalId: '1000-vor-td-0' }],
  };

  it('accepts an action-only event', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      actingTeamEraId: 5,
      actingPlayerId: 9,
      actionType: 'touchdown',
    });
    expect(parsed.actionType).toBe('touchdown');
    expect(parsed.consequenceType).toBeUndefined();
  });

  it('accepts a consequence-only event', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      consequenceTeamEraId: 6,
      consequenceType: 'sent_off',
    });
    expect(parsed.consequenceType).toBe('sent_off');
  });

  it('rejects an event with neither action nor consequence', () => {
    expect(() => UpsertMatchEventSchema.parse(base)).toThrow();
  });

  it('rejects an unknown action type', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({ ...base, actionType: 'nonsense' }),
    ).toThrow();
  });

  it('requires at least one external id', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        matchId: 1,
        actionType: 'foul',
        externalIds: [],
      }),
    ).toThrow();
  });
});
