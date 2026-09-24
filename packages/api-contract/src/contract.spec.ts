import type { AnyContractProcedure } from '@orpc/contract';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { contract } from './contract';
import { UpsertCoachSchema } from './schemas/coach';
import {
  ExternalSystemSchema,
  UpsertExternalSystemSchema,
} from './schemas/external-system';
import {
  SyncPositionRaceErasSchema,
  UpsertPositionSchema,
} from './schemas/position';

function errorCodesOf(procedure: AnyContractProcedure): string[] {
  const errorMap = procedure['~orpc'].errorMap as Record<string, unknown>;
  return Object.keys(errorMap);
}

describe('contract', () => {
  it('defines coaches.upsert with CONFLICT and BAD_REQUEST errors', () => {
    expect(errorCodesOf(contract.coaches.upsert)).toEqual([
      'CONFLICT',
      'BAD_REQUEST',
    ]);
  });

  it('defines externalSystems.upsert with no declared errors', () => {
    expect(errorCodesOf(contract.externalSystems.upsert)).toEqual([]);
  });

  it('UpsertExternalSystemSchema requires name and category', () => {
    expect(
      UpsertExternalSystemSchema.safeParse({
        name: 'BBL',
        category: 'imported_data_source',
      }).success,
    ).toBe(true);
    expect(UpsertExternalSystemSchema.safeParse({ name: 'BBL' }).success).toBe(
      false,
    );
    expect(
      UpsertExternalSystemSchema.safeParse({ name: 'BBL', category: 'nope' })
        .success,
    ).toBe(false);
  });

  it('ExternalSystemSchema includes category', () => {
    expect(
      ExternalSystemSchema.safeParse({
        id: 1,
        name: 'BBL',
        category: 'imported_data_source',
        createdAt: new Date('2026-01-01'),
      }).success,
    ).toBe(true);
  });

  it('defines positions.upsert with CONFLICT and BAD_REQUEST errors', () => {
    expect(errorCodesOf(contract.positions.upsert)).toEqual([
      'CONFLICT',
      'BAD_REQUEST',
    ]);
  });

  it('defines players.upsert with CONFLICT and BAD_REQUEST errors', () => {
    expect(errorCodesOf(contract.players.upsert)).toEqual([
      'CONFLICT',
      'BAD_REQUEST',
    ]);
  });

  it('requires at least one external ID when upserting a coach', () => {
    const result = UpsertCoachSchema.safeParse({
      name: 'Roze Madder',
      externalIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid syncRaceEras input', () => {
    expect(() =>
      SyncPositionRaceErasSchema.parse({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      }),
    ).not.toThrow();
  });

  it('strips a races field from an upsert payload', () => {
    const parsed = UpsertPositionSchema.safeParse({
      name: 'Lineman',
      isStarPlayer: false,
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
      races: [{ raceId: 1, isDeleted: false }],
    });
    expect(parsed.success).toBe(true);
    expect((parsed.data as Record<string, unknown>).races).toBeUndefined();
  });

  it('defines an upsertBatch for every entity router', () => {
    const routers = [
      contract.coaches,
      contract.leagues,
      contract.races,
      contract.players,
      contract.positions,
      contract.rulesSets,
      contract.eras,
      contract.competitions,
      contract.matches,
      contract.matchEvents,
      contract.teams,
      contract.externalSystems,
    ];
    for (const router of routers) {
      expect(router).toHaveProperty('upsertBatch');
    }
  });

  it('defines trophies.upsert with no upsertBatch', () => {
    expect(contract.trophies).toHaveProperty('upsert');
    expect(contract.trophies).not.toHaveProperty('upsertBatch');
  });

  it('defines competitionGroups.upsert with the standard upsert error codes, plus list', () => {
    expect(errorCodesOf(contract.competitionGroups.upsert)).toEqual([
      'CONFLICT',
      'BAD_REQUEST',
    ]);
    expect(contract.competitionGroups).toHaveProperty('list');
    expect(contract.competitionGroups).not.toHaveProperty('upsertBatch');
  });

  it('defines coaches.upsertBatch with no declared errors', () => {
    expect(errorCodesOf(contract.coaches.upsertBatch)).toEqual([]);
  });

  it('matchEvents.upsertBatch rejects an empty batch', () => {
    const inputSchema = contract.matchEvents.upsertBatch['~orpc']
      .inputSchema as z.ZodType;
    expect(inputSchema.safeParse([]).success).toBe(false);
    expect(
      inputSchema.safeParse([
        {
          matchId: 1,
          actionType: 'touchdown',
          externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
        },
      ]).success,
    ).toBe(true);
  });

  it('exposes a sppAwardValues.sync procedure', () => {
    expect(contract.sppAwardValues.sync).toBeDefined();
  });

  it('exposes a players.syncLastingInjuryHistory procedure', () => {
    expect(contract.players.syncLastingInjuryHistory).toBeDefined();
    // Writes nothing a caller can conflict on and returns no entity, so it
    // declares no errors — the same shape positions.syncRaceEras has.
    expect(errorCodesOf(contract.players.syncLastingInjuryHistory)).toEqual([]);

    const inputSchema = contract.players.syncLastingInjuryHistory['~orpc']
      .inputSchema as z.ZodType;
    expect(inputSchema.safeParse({ playerIds: [1, 2, 3] }).success).toBe(true);
    expect(inputSchema.safeParse({ playerIds: [] }).success).toBe(true);
    expect(inputSchema.safeParse({}).success).toBe(false);

    const outputSchema = contract.players.syncLastingInjuryHistory['~orpc']
      .outputSchema as z.ZodType;
    expect(outputSchema.safeParse({ backfilledPlayerIds: [7] }).success).toBe(
      true,
    );
  });

  it('players.upsert accepts the lasting-injury group only in full', () => {
    const inputSchema = contract.players.upsert['~orpc']
      .inputSchema as z.ZodType;
    const externalIds = [{ externalSystemId: 1, externalId: 'pid-7' }];
    const full = {
      missNextGame: true,
      nigglingInjuryCount: 1,
      moveReductionCount: 0,
      strengthReductionCount: 1,
      agilityReductionCount: 0,
      passingReductionCount: 0,
      armourReductionCount: 2,
    };

    // None of the group at all is fine: an importer that says nothing about
    // lasting injuries leaves the stored state untouched.
    expect(inputSchema.safeParse({ externalIds }).success).toBe(true);
    expect(inputSchema.safeParse({ ...full, externalIds }).success).toBe(true);
    // A partial group cannot be stored meaningfully.
    expect(
      inputSchema.safeParse({ missNextGame: true, externalIds }).success,
    ).toBe(false);
    // Counts are nonnegative integers; a negative one is authored nonsense.
    expect(
      inputSchema.safeParse({
        ...full,
        nigglingInjuryCount: -1,
        externalIds,
      }).success,
    ).toBe(false);
  });

  it('players.upsert returns the lasting-injury state on the entity', () => {
    const outputSchema = contract.players.upsert['~orpc']
      .outputSchema as z.ZodType;
    const parsed = outputSchema.safeParse({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      move: 7,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      missNextGame: false,
      nigglingInjuryCount: 0,
      moveReductionCount: 0,
      strengthReductionCount: 0,
      agilityReductionCount: 0,
      passingReductionCount: 0,
      armourReductionCount: 0,
      moveIncreaseCount: 0,
      strengthIncreaseCount: 0,
      agilityIncreaseCount: 0,
      passingIncreaseCount: 0,
      armourIncreaseCount: 0,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    expect(parsed.success).toBe(true);
    // Required, not optional: every stored row has concrete values.
    expect(
      outputSchema.safeParse({
        id: 1,
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        move: 7,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
        createdAt: new Date('2026-01-01'),
        created: true,
      }).success,
    ).toBe(false);
  });

  it('defines skills.upsert with CONFLICT and BAD_REQUEST errors', () => {
    expect(errorCodesOf(contract.skills.upsert)).toEqual([
      'CONFLICT',
      'BAD_REQUEST',
    ]);
  });

  it('defines skillRulesSets.sync with a BAD_REQUEST error', () => {
    expect(errorCodesOf(contract.skillRulesSets.sync)).toEqual(['BAD_REQUEST']);
  });

  it('defines skillRulesSets.list with no declared errors', () => {
    expect(errorCodesOf(contract.skillRulesSets.list)).toEqual([]);
  });

  it('defines positionRulesSetSkills.sync with a BAD_REQUEST error', () => {
    expect(errorCodesOf(contract.positionRulesSetSkills.sync)).toEqual([
      'BAD_REQUEST',
    ]);
  });

  it('defines positionRulesSetSkills.list with no declared errors', () => {
    expect(errorCodesOf(contract.positionRulesSetSkills.list)).toEqual([]);
  });

  it('defines playerSkills.sync with a BAD_REQUEST error', () => {
    expect(errorCodesOf(contract.playerSkills.sync)).toEqual(['BAD_REQUEST']);
  });

  it('defines playerSkills.list with no declared errors', () => {
    expect(errorCodesOf(contract.playerSkills.list)).toEqual([]);
  });

  it('defines keywords.upsert with CONFLICT and BAD_REQUEST errors', () => {
    expect(errorCodesOf(contract.keywords.upsert)).toEqual(
      expect.arrayContaining(['CONFLICT', 'BAD_REQUEST']),
    );
  });

  it('defines keywords.list as read-only', () => {
    expect(errorCodesOf(contract.keywords.list)).toEqual([]);
  });

  it('defines positionRulesSetKeywords.sync with BAD_REQUEST', () => {
    expect(errorCodesOf(contract.positionRulesSetKeywords.sync)).toEqual([
      'BAD_REQUEST',
    ]);
  });

  it('defines positionRulesSetKeywords.list as read-only', () => {
    expect(errorCodesOf(contract.positionRulesSetKeywords.list)).toEqual([]);
  });
});

describe('resolve procedures', () => {
  const resolvable = [
    'coaches',
    'leagues',
    'races',
    'positions',
    'rulesSets',
    'eras',
    'competitions',
    'competitionGroups',
    'teams',
    'players',
  ] as const;

  it.each(resolvable)('exposes resolve and resolveBatch on %s', (name) => {
    const namespace = contract[name] as Record<string, unknown>;
    expect(namespace.resolve).toBeDefined();
    expect(namespace.resolveBatch).toBeDefined();
  });

  const notResolvable = [
    'matches',
    'matchEvents',
    'trophies',
    'trophyAwards',
    'sppAwardValues',
    'externalSystems',
  ] as const;

  it.each(notResolvable)('does not expose resolve on %s', (name) => {
    const namespace = contract[name] as Record<string, unknown>;
    expect(namespace.resolve).toBeUndefined();
    expect(namespace.resolveBatch).toBeUndefined();
  });

  it('exposes tpRosters.import declaring no errors', () => {
    expect(contract.tpRosters.import).toBeDefined();
    expect(errorCodesOf(contract.tpRosters.import)).toEqual([]);
  });

  it('tpRosters.import takes raw roster JSON plus its era and external system', () => {
    const inputSchema = contract.tpRosters.import['~orpc']
      .inputSchema as z.ZodType;
    expect(
      inputSchema.safeParse({
        roster: { id: 1 },
        era: 'Fourth era',
        externalSystemName: 'TP',
      }).success,
    ).toBe(true);
    expect(
      inputSchema.safeParse({ roster: {}, era: 'Fourth era' }).success,
    ).toBe(false);
  });

  it('exposes tpCompetitions.import declaring no errors', () => {
    expect(contract.tpCompetitions.import).toBeDefined();
    expect(errorCodesOf(contract.tpCompetitions.import)).toEqual([]);
  });

  it('exposes tpMatches.import declaring no errors', () => {
    expect(contract.tpMatches.import).toBeDefined();
    expect(errorCodesOf(contract.tpMatches.import)).toEqual([]);
  });

  it('tpMatches.import takes raw match JSON plus its bracket, competition and external system', () => {
    const inputSchema = contract.tpMatches.import['~orpc']
      .inputSchema as z.ZodType;
    expect(
      inputSchema.safeParse({
        match: { matchId: 1 },
        bracket: [],
        competitionTpId: 18442,
        externalSystemName: 'TP',
      }).success,
    ).toBe(true);
    expect(
      inputSchema.safeParse({
        match: {},
        bracket: [],
        externalSystemName: 'TP',
      }).success,
    ).toBe(false);
  });
});
