import { describe, expect, it } from 'vitest';

import {
  TrophyAwardRuleEventTypeSchema,
  TrophySchema,
  UpsertTrophySchema,
} from './trophy';

describe('trophy schemas', () => {
  it('accepts a full trophy with a description', () => {
    const parsed = TrophySchema.parse({
      id: 7,
      name: 'Chaos Cup',
      recipientKind: 'team',
      description: 'The team that wins after four matches.',
      competitionGroupId: 2,
      leagueId: null,
      awardRuleKind: 'direct_source',
      awardProcedure: 'Recorded from the season standings.',
      awardRuleRole: null,
      awardRuleTieCutoff: null,
      awardRuleThreshold: null,
      awardRuleMeasure: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.recipientKind).toBe('team');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('accepts a trophy with a null description', () => {
    const parsed = TrophySchema.parse({
      id: 8,
      name: 'Ogretoberfest',
      recipientKind: 'team',
      description: null,
      competitionGroupId: 2,
      leagueId: null,
      awardRuleKind: 'direct_source',
      awardProcedure: 'Recorded from the season standings.',
      awardRuleRole: null,
      awardRuleTieCutoff: null,
      awardRuleThreshold: null,
      awardRuleMeasure: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.description).toBeNull();
  });

  it('rejects an unknown recipient kind', () => {
    const parsed = TrophySchema.safeParse({
      id: 9,
      name: 'Nope',
      recipientKind: 'coach',
      description: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an upsert with an empty externalIds array', () => {
    expect(() =>
      UpsertTrophySchema.parse({
        name: 'Ogretoberfest',
        recipientKind: 'team',
        externalIds: [],
      }),
    ).toThrow();
  });

  it('rejects an upsert that omits externalIds', () => {
    expect(() => UpsertTrophySchema.parse({ name: 'Korpen' })).toThrow();
  });

  it('accepts a rename-only upsert carrying just externalIds and a name', () => {
    const parsed = UpsertTrophySchema.parse({
      name: 'Major 1st',
      externalIds: [{ externalSystemId: 1, externalId: 'Major 1st' }],
    });
    expect(parsed.recipientKind).toBeUndefined();
    expect(parsed.description).toBeUndefined();
  });

  it('accepts an explicit null description to clear a stored one', () => {
    const parsed = UpsertTrophySchema.parse({
      description: null,
      externalIds: [{ externalSystemId: 1, externalId: 'Korpen' }],
    });
    expect(parsed.description).toBeNull();
  });

  it('accepts an optional competitionGroupId on upsert', () => {
    expect(
      UpsertTrophySchema.parse({
        name: 'Major Gold',
        competitionGroupId: 2,
        externalIds: [{ externalSystemId: 1, externalId: 'Major Gold' }],
      }).competitionGroupId,
    ).toBe(2);
    expect(
      UpsertTrophySchema.parse({
        name: 'Major Gold',
        externalIds: [{ externalSystemId: 1, externalId: 'Major Gold' }],
      }).competitionGroupId,
    ).toBeUndefined();
  });

  it('accepts a league-scoped trophy with a null competition group', () => {
    const parsed = TrophySchema.parse({
      id: 1,
      name: 'Legendary Player',
      recipientKind: 'player',
      description: null,
      competitionGroupId: null,
      leagueId: 7,
      awardRuleKind: 'max_count',
      awardProcedure: null,
      awardRuleRole: 'acting',
      awardRuleTieCutoff: 1,
      awardRuleThreshold: null,
      awardRuleMeasure: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.competitionGroupId).toBeNull();
    expect(parsed.leagueId).toBe(7);
  });

  it('accepts an upsert that clears the competition group and sets a league', () => {
    const parsed = UpsertTrophySchema.parse({
      name: 'Legendary Player',
      competitionGroupId: null,
      leagueId: 7,
      externalIds: [{ externalSystemId: 1, externalId: 'Legendary Player' }],
    });
    expect(parsed.competitionGroupId).toBeNull();
    expect(parsed.leagueId).toBe(7);
  });

  it('leaves both scope fields undefined when an upsert omits them', () => {
    const parsed = UpsertTrophySchema.parse({
      name: 'Legendary Player',
      externalIds: [{ externalSystemId: 1, externalId: 'Legendary Player' }],
    });
    expect(parsed.competitionGroupId).toBeUndefined();
    expect(parsed.leagueId).toBeUndefined();
  });

  it('rejects a non-integer league id on upsert', () => {
    expect(() =>
      UpsertTrophySchema.parse({
        name: 'Legendary Player',
        leagueId: 1.5,
        externalIds: [{ externalSystemId: 1, externalId: 'Legendary Player' }],
      }),
    ).toThrow();
  });

  it('accepts a fully curated computed award rule', () => {
    const parsed = UpsertTrophySchema.parse({
      name: 'Top Fouler',
      recipientKind: 'player',
      awardRuleKind: 'max_count',
      awardRuleRole: 'acting',
      awardRuleTieCutoff: 4,
      awardRuleMatchEventTypes: [
        { actionType: 'foul' },
        { consequenceType: 'casualty' },
      ],
      externalIds: [
        { externalSystemId: 1, externalId: 'Top Fouler-Major Season' },
      ],
    });
    expect(parsed.awardRuleKind).toBe('max_count');
    expect(parsed.awardRuleMatchEventTypes).toEqual([
      { actionType: 'foul' },
      { consequenceType: 'casualty' },
    ]);
  });

  it('accepts a rule restricted to specific positions by Name external id', () => {
    const parsed = UpsertTrophySchema.parse({
      name: 'Bierhallenführer',
      recipientKind: 'player',
      awardRuleKind: 'max_spp_sum',
      awardRuleEligiblePositions: [
        'Ogre: Ogre Blocker',
        'Ogre: Ogre Runt Punter',
      ],
      externalIds: [{ externalSystemId: 1, externalId: 'Bierhallenführer' }],
    });
    expect(parsed.awardRuleEligiblePositions).toEqual([
      'Ogre: Ogre Blocker',
      'Ogre: Ogre Runt Punter',
    ]);
  });

  it('rejects an empty eligible-position external id', () => {
    expect(() =>
      UpsertTrophySchema.parse({
        name: 'Bierhallenführer',
        recipientKind: 'player',
        awardRuleKind: 'max_spp_sum',
        awardRuleEligiblePositions: [''],
        externalIds: [{ externalSystemId: 1, externalId: 'Bierhallenführer' }],
      }),
    ).toThrow();
  });

  it('accepts a source-recorded rule with a procedure and no rule columns', () => {
    const parsed = UpsertTrophySchema.parse({
      name: 'Major Gold',
      recipientKind: 'team',
      awardRuleKind: 'direct_source',
      awardProcedure: 'Recorded from the season standings.',
      externalIds: [{ externalSystemId: 1, externalId: 'Major 1st' }],
    });
    expect(parsed.awardProcedure).toBe('Recorded from the season standings.');
  });

  it('accepts an award rule event type with exactly one field set', () => {
    expect(
      TrophyAwardRuleEventTypeSchema.parse({ actionType: 'foul' }),
    ).toEqual({ actionType: 'foul' });
    expect(
      TrophyAwardRuleEventTypeSchema.parse({ consequenceType: 'casualty' }),
    ).toEqual({ consequenceType: 'casualty' });
  });

  it('rejects an award rule event type with neither field set', () => {
    expect(() => TrophyAwardRuleEventTypeSchema.parse({})).toThrow();
    expect(() =>
      TrophyAwardRuleEventTypeSchema.parse({
        actionType: null,
        consequenceType: null,
      }),
    ).toThrow();
  });

  it('rejects an award rule event type with both fields set', () => {
    expect(() =>
      TrophyAwardRuleEventTypeSchema.parse({
        actionType: 'foul',
        consequenceType: 'casualty',
      }),
    ).toThrow();
  });

  it('rejects an unknown award rule kind', () => {
    expect(() =>
      UpsertTrophySchema.parse({
        name: 'X',
        awardRuleKind: 'guesswork',
        externalIds: [{ externalSystemId: 1, externalId: 'X' }],
      }),
    ).toThrow();
  });
});
