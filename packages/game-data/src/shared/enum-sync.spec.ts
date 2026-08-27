import {
  ActionTypeSchema,
  COMPETITION_TYPES,
  ConsequenceAvoidedBySchema,
  ConsequenceTypeSchema,
  EventTypeSchema,
  ExternalSystemCategorySchema,
  MATCH_CATEGORIES,
  SecretObjectiveSchema,
  TrophyRecipientKindSchema,
  UnidentifiedParticipantKindSchema,
  WeatherTypeSchema,
} from '@blood-bowl-tracker/api-contract';
import * as db from '@blood-bowl-tracker/db';
import { describe, expect, it } from 'vitest';

/**
 * packages/api-contract deliberately has no dependency on packages/db, so
 * every domain vocabulary that exists as a Postgres enum in the database
 * schema is written out a second time as a Zod schema in the contract.
 * These tests are the only thing tying the two copies together.
 *
 * The check is one-directional (db to contract) on purpose: several contract
 * enums are curated subsets rather than mirrors (SppEarningActionTypeSchema
 * is a subset of action_type, for example), so a reverse "every contract
 * enum needs a db enum" check would report false positives.
 */

/** Anything shaped like a drizzle enum: it carries a string `enumValues` array. */
interface EnumLike {
  readonly enumValues: readonly string[];
}

/**
 * A drizzle PgEnum is a *callable* object (calling it builds a column), so
 * `typeof` is 'function', not 'object'. Both are accepted here; a guard that
 * only accepted 'object' would discover nothing and pass vacuously.
 */
const isEnumLike = (value: unknown): value is EnumLike => {
  if (typeof value !== 'object' && typeof value !== 'function') {
    return false;
  }
  if (value === null) {
    return false;
  }
  const candidate = (value as { enumValues?: unknown }).enumValues;
  return (
    Array.isArray(candidate) &&
    candidate.every((entry) => typeof entry === 'string')
  );
};

/** Every export of packages/db that looks like a drizzle enum, by export name. */
const dbEnums: ReadonlyArray<readonly [string, EnumLike]> = Object.entries(
  db as Record<string, unknown>,
)
  .filter((entry): entry is [string, EnumLike] => isEnumLike(entry[1]))
  .sort((a, b) => a[0].localeCompare(b[0]));

/**
 * db enum export name -> the api-contract values that must mirror it.
 * Adding a new enum to packages/db without adding a line here fails the
 * completeness test below.
 */
const contractValuesByDbEnum: Record<string, readonly string[]> = {
  actionTypeEnum: ActionTypeSchema.options,
  competitionTypeEnum: COMPETITION_TYPES,
  consequenceAvoidedByEnum: ConsequenceAvoidedBySchema.options,
  consequenceTypeEnum: ConsequenceTypeSchema.options,
  eventTypeEnum: EventTypeSchema.options,
  externalSystemCategoryEnum: ExternalSystemCategorySchema.options,
  matchCategoryEnum: MATCH_CATEGORIES,
  secretObjectiveEnum: SecretObjectiveSchema.options,
  trophyRecipientKindEnum: TrophyRecipientKindSchema.options,
  unidentifiedParticipantKindEnum: UnidentifiedParticipantKindSchema.options,
  weatherTypeEnum: WeatherTypeSchema.options,
};

describe('db enum discovery', () => {
  it('finds every known db enum', () => {
    expect(dbEnums.map(([name]) => name)).toEqual(
      [
        'actionTypeEnum',
        'competitionTypeEnum',
        'consequenceAvoidedByEnum',
        'consequenceTypeEnum',
        'eventTypeEnum',
        'externalSystemCategoryEnum',
        'matchCategoryEnum',
        'secretObjectiveEnum',
        'trophyRecipientKindEnum',
        'unidentifiedParticipantKindEnum',
        'weatherTypeEnum',
      ].sort(),
    );
  });
});

describe('db enums are mirrored in api-contract', () => {
  it('every db enum has a mapped api-contract counterpart', () => {
    const unmapped = dbEnums
      .map(([name]) => name)
      .filter((name) => !(name in contractValuesByDbEnum));
    expect(unmapped).toEqual([]);
  });

  it.each(dbEnums.map(([name]) => name))(
    '%s has the same values on both sides',
    (name) => {
      const dbEnum = dbEnums.find(([entry]) => entry === name)?.[1];
      const contractValues = contractValuesByDbEnum[name];
      expect(dbEnum).toBeDefined();
      expect(contractValues).toBeDefined();
      expect([...(dbEnum?.enumValues ?? [])].sort()).toEqual(
        [...(contractValues ?? [])].sort(),
      );
    },
  );
});
