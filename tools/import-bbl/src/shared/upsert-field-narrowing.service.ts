import type {
  UpsertCompetition,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

interface ResolveDefiniteFieldOptions {
  value: number | undefined;
  entityLabel: string;
  fieldName: string;
}

/**
 * Narrows widened-optional upsert fields (several upsert schema fields are
 * optional to support partial-upsert payloads from other callers) back to a
 * definite number for the import-bbl services that always resolve these
 * fields before building their upsert -- skipping and recording an error
 * otherwise -- so every upsert reaching these read sites has a definite
 * value. Each method throws if that invariant is ever violated, rather than
 * silently reading `undefined`.
 */
@Injectable()
export class UpsertFieldNarrowingService {
  /**
   * Narrow a competition upsert's eraId back to a definite number.
   * UpsertCompetitionSchema.eraId is optional to support partial-upsert
   * payloads from other callers, but BblCompetitionsImportService always
   * resolves eraId before building this upsert -- skipping and recording an
   * error otherwise -- so every UpsertCompetition reaching this service has
   * one.
   */
  resolveDefiniteEraId(competition: UpsertCompetition): number {
    return this.resolveDefiniteField({
      value: competition.eraId,
      entityLabel: `Competition "${competition.name}"`,
      fieldName: 'eraId',
    });
  }

  /**
   * Narrow a team upsert's raceId back to a definite number.
   * UpsertTeamSchema.raceId is optional to support partial-upsert payloads
   * from other callers, but BblTeamsImportService always resolves raceId
   * before building this upsert -- skipping and recording an error
   * otherwise -- so every UpsertTeam reaching this service has one.
   */
  resolveDefiniteRaceId(team: UpsertTeam): number {
    return this.resolveDefiniteField({
      value: team.raceId,
      entityLabel: `Team "${team.name}"`,
      fieldName: 'raceId',
    });
  }

  private resolveDefiniteField({
    value,
    entityLabel,
    fieldName,
  }: ResolveDefiniteFieldOptions): number {
    if (value === undefined) {
      throw new Error(
        `${entityLabel} has no ${fieldName}; import-bbl always resolves ${fieldName} before building its upsert.`,
      );
    }
    return value;
  }
}
