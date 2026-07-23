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

  it('accepts an event with both actionType and consequenceType set (opponent-caused injury)', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      actingTeamEraId: 5,
      consequenceTeamEraId: 6,
      actionType: 'casualty',
      consequenceType: 'death',
    });
    expect(parsed.actionType).toBe('casualty');
    expect(parsed.consequenceType).toBe('death');
  });

  it('accepts an eventType-only event (weather) with a decoded weatherType', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      eventType: 'weather',
      weatherType: 'perfect_conditions',
    });
    expect(parsed.eventType).toBe('weather');
    expect(parsed.weatherType).toBe('perfect_conditions');
    expect(parsed.actionType).toBeUndefined();
    expect(parsed.consequenceType).toBeUndefined();
  });

  it('rejects a weatherType that is not a known enum value', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        ...base,
        eventType: 'weather',
        weatherType: 'sunny_with_a_chance_of_orcs',
      }),
    ).toThrow();
  });

  it('accepts a secret_objective event with a decoded secretObjective', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      actionType: 'secret_objective',
      secretObjective: 'just_a_little_further',
    });
    expect(parsed.actionType).toBe('secret_objective');
    expect(parsed.secretObjective).toBe('just_a_little_further');
  });

  it('rejects a secretObjective that is not a known enum value', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        ...base,
        actionType: 'secret_objective',
        secretObjective: 42,
      }),
    ).toThrow();
  });

  it('rejects an event with both eventType and actionType set', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        ...base,
        eventType: 'weather',
        actionType: 'touchdown',
      }),
    ).toThrow();
  });

  it('rejects an event with both eventType and consequenceType set', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        ...base,
        eventType: 'weather',
        consequenceType: 'sent_off',
      }),
    ).toThrow();
  });

  it('rejects an unknown event type', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({ ...base, eventType: 'nonsense' }),
    ).toThrow();
  });

  it('accepts inducementsFromTreasury on an inducements event', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      actionType: 'inducements',
      inducementsFromTreasury: 50,
    });
    expect(parsed.inducementsFromTreasury).toBe(50);
  });
});
