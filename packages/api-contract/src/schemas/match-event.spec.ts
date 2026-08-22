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

  it.each(['throw_team_mate', 'catch'] as const)(
    'accepts a %s action event',
    (actionType) => {
      const parsed = UpsertMatchEventSchema.parse({
        ...base,
        actingTeamEraId: 5,
        actingPlayerId: 9,
        actionType,
      });
      expect(parsed.actionType).toBe(actionType);
    },
  );

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

  it('accepts an explicit null for a nullable column field', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      actionType: 'touchdown',
      actingPlayerId: null,
    });
    expect(parsed.actingPlayerId).toBeNull();
  });

  it('treats a null eventType as absent when validating the classification triple', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      eventType: null,
      actionType: 'foul',
    });
    expect(parsed.eventType).toBeNull();
    expect(parsed.actionType).toBe('foul');
  });

  it('rejects a null actingTeamEraId — it is a resolution input, not a column', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        ...base,
        actionType: 'foul',
        actingTeamEraId: null,
      }),
    ).toThrow();
  });

  it('accepts a casualty_avoided consequence with its avoided-by and severity', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      consequenceTeamEraId: 6,
      consequenceType: 'casualty_avoided',
      consequenceAvoidedBy: 'apothecary',
      consequenceAvoidedSeverity: 'death',
    });
    expect(parsed.consequenceType).toBe('casualty_avoided');
    expect(parsed.consequenceAvoidedBy).toBe('apothecary');
    expect(parsed.consequenceAvoidedSeverity).toBe('death');
  });

  it('accepts an unidentified participant kind on both roles', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      actionType: 'badly_hurt',
      consequenceType: 'badly_hurt',
      actingUnidentifiedKind: 'mercenary_or_star',
      consequenceUnidentifiedKind: 'journeyman',
    });
    expect(parsed.actingUnidentifiedKind).toBe('mercenary_or_star');
    expect(parsed.consequenceUnidentifiedKind).toBe('journeyman');
  });

  it('accepts every unidentified participant kind', () => {
    for (const kind of [
      'journeyman',
      'mercenary',
      'mercenary_or_star',
      'fans_or_random_event',
      'mercenary_or_fans_or_random_event',
    ] as const) {
      const parsed = UpsertMatchEventSchema.parse({
        ...base,
        actionType: 'foul',
        actingUnidentifiedKind: kind,
      });
      expect(parsed.actingUnidentifiedKind).toBe(kind);
    }
  });

  it('accepts regeneration as an avoided-by value', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      consequenceType: 'casualty_avoided',
      consequenceAvoidedBy: 'regeneration',
      consequenceAvoidedSeverity: 'miss_next_game',
    });
    expect(parsed.consequenceAvoidedBy).toBe('regeneration');
  });

  it('rejects an unknown unidentified participant kind', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        ...base,
        actionType: 'foul',
        actingUnidentifiedKind: 'wizard',
      }),
    ).toThrow();
  });

  it('rejects an unknown avoided-by value', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        ...base,
        consequenceType: 'casualty_avoided',
        consequenceAvoidedBy: 'sheer_luck',
      }),
    ).toThrow();
  });

  it('accepts explicit nulls for the unidentified-kind and avoided-casualty fields', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      actionType: 'touchdown',
      actingUnidentifiedKind: null,
      consequenceUnidentifiedKind: null,
      consequenceAvoidedBy: null,
      consequenceAvoidedSeverity: null,
    });
    expect(parsed.actingUnidentifiedKind).toBeNull();
    expect(parsed.consequenceAvoidedSeverity).toBeNull();
  });

  it('satisfies the classification refine with casualty_avoided alone', () => {
    const parsed = UpsertMatchEventSchema.parse({
      ...base,
      consequenceType: 'casualty_avoided',
    });
    expect(parsed.consequenceType).toBe('casualty_avoided');
  });

  it('accepts an sppValue on an acting event', () => {
    const parsed = UpsertMatchEventSchema.parse({
      matchId: 1,
      actionType: 'touchdown',
      actingPlayerId: 9,
      sppValue: 3,
      externalIds: [{ externalSystemId: 1, externalId: 'tp-1' }],
    });
    expect(parsed.sppValue).toBe(3);
  });

  it('accepts an explicit null sppValue so a caller can clear it', () => {
    const parsed = UpsertMatchEventSchema.parse({
      matchId: 1,
      actionType: 'touchdown',
      sppValue: null,
      externalIds: [{ externalSystemId: 1, externalId: 'tp-1' }],
    });
    expect(parsed.sppValue).toBeNull();
  });

  it('rejects a non-integer sppValue', () => {
    expect(() =>
      UpsertMatchEventSchema.parse({
        matchId: 1,
        actionType: 'touchdown',
        sppValue: 1.5,
        externalIds: [{ externalSystemId: 1, externalId: 'tp-1' }],
      }),
    ).toThrow();
  });

  it('accepts computeSppValue as a resolution input', () => {
    const parsed = UpsertMatchEventSchema.parse({
      matchId: 1,
      actionType: 'touchdown',
      actingPlayerId: 9,
      computeSppValue: true,
      externalIds: [{ externalSystemId: 1, externalId: 'bbl-1' }],
    });
    expect(parsed.computeSppValue).toBe(true);
  });

  it('leaves sppValue and computeSppValue undefined when omitted', () => {
    const parsed = UpsertMatchEventSchema.parse({
      matchId: 1,
      actionType: 'touchdown',
      externalIds: [{ externalSystemId: 1, externalId: 'tp-1' }],
    });
    expect(parsed.sppValue).toBeUndefined();
    expect(parsed.computeSppValue).toBeUndefined();
  });
});
