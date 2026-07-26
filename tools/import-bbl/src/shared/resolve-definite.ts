import type {
  UpsertCompetition,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';

/**
 * Narrow a widened-optional upsert field back to a definite number.
 *
 * api-contract (issue #174) relaxed several upsert schema fields to optional
 * to support partial-upsert payloads from other callers, but each import-bbl
 * service that reads one of these fields always resolves it before building
 * its upsert -- skipping and recording an error otherwise -- so every upsert
 * reaching these read sites has a definite value. This throws if that
 * invariant is ever violated, rather than silently reading `undefined`.
 */
function resolveDefiniteField({
  value,
  entityLabel,
  fieldName,
}: {
  value: number | undefined;
  entityLabel: string;
  fieldName: string;
}): number {
  if (value === undefined) {
    throw new Error(
      `${entityLabel} has no ${fieldName}; import-bbl always resolves ${fieldName} before building its upsert.`,
    );
  }
  return value;
}

/**
 * Narrow a competition upsert's eraId back to a definite number.
 * UpsertCompetitionSchema.eraId is optional (api-contract, issue #174) to
 * support partial-upsert payloads from other callers, but
 * BblCompetitionsImportService always resolves eraId before building this
 * upsert -- skipping and recording an error otherwise -- so every
 * UpsertCompetition reaching this service has one.
 */
export function resolveDefiniteEraId(competition: UpsertCompetition): number {
  return resolveDefiniteField({
    value: competition.eraId,
    entityLabel: `Competition "${competition.name}"`,
    fieldName: 'eraId',
  });
}

/**
 * Narrow a team upsert's raceId back to a definite number.
 * UpsertTeamSchema.raceId is optional (api-contract, issue #174) to
 * support partial-upsert payloads from other callers, but
 * BblTeamsImportService always resolves raceId before building this
 * upsert -- skipping and recording an error otherwise -- so every
 * UpsertTeam reaching this service has one.
 */
export function resolveDefiniteRaceId(team: UpsertTeam): number {
  return resolveDefiniteField({
    value: team.raceId,
    entityLabel: `Team "${team.name}"`,
    fieldName: 'raceId',
  });
}
