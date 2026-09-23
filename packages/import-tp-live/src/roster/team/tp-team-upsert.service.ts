import type {
  ImportError,
  TeamEra,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import { UpsertTeamSchema } from '@blood-bowl-tracker/api-contract';
import {
  CoachesService,
  RacesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpNameExternalIdService } from '../../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import type { TpRosterContext } from '../tp-roster-context.service';

/** Options for {@link TpTeamUpsertService.upsertTeam}. */
export interface UpsertTeamOptions {
  roster: TpRoster;
  context: TpRosterContext;
  errors: ImportError[];
}

@Injectable()
export class TpTeamUpsertService {
  constructor(
    private readonly races: RacesService,
    private readonly coaches: CoachesService,
    private readonly teams: TeamsService,
    private readonly nameExternalId: TpNameExternalIdService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts the roster's team under the context's era. A team is keyed by
   * its roster id (TP external id) and its name (Name external id); its race
   * resolves by TP race code and its coach by TP coach id. A team whose race
   * or coach cannot be resolved is recorded as an error and skipped rather
   * than upserted with an invalid foreign key. Returns every team era the
   * team now has — the era sync only ever adds, so an era an earlier import
   * linked stays linked — or undefined when nothing was upserted.
   */
  async upsertTeam({
    roster,
    context,
    errors,
  }: UpsertTeamOptions): Promise<TeamEra[] | undefined> {
    const [race, coach] = await Promise.all([
      this.races.resolve({
        externalSystemId: context.tpSystemId,
        externalId: roster.teamRaceCode,
      }),
      this.coaches.resolve({
        externalSystemId: context.tpSystemId,
        externalId: roster.coachTpId,
      }),
    ]);
    if (!race.found) {
      errors.push(
        this.importResults.error({
          item: { team: roster.id, teamRaceCode: roster.teamRaceCode },
          message: `Failed to import team "${roster.teamName}": could not resolve race for code "${roster.teamRaceCode}"`,
        }),
      );
      return undefined;
    }
    if (!coach.found) {
      errors.push(
        this.importResults.error({
          item: { team: roster.id, coachTpId: roster.coachTpId },
          message: `Failed to import team "${roster.teamName}": could not resolve coach "${roster.coachTpId}"`,
        }),
      );
      return undefined;
    }

    const data: UpsertTeam = {
      name: roster.teamName,
      raceId: race.id,
      coachId: coach.id,
      eras: [context.era.id],
      externalIds: [
        {
          externalSystemId: context.tpSystemId,
          externalId: String(roster.id),
        },
        {
          externalSystemId: context.nameSystemId,
          externalId: this.nameExternalId.forTeam(roster.teamName),
        },
      ],
    };
    // Parsed through the contract schema so a direct call is held to the
    // same validation a teams.upsert RPC call would be.
    const upserted = await this.runner.record({
      run: () => this.teams.upsert(UpsertTeamSchema.parse(data)),
      item: data,
      errors,
      buildErrorMessage: (error) =>
        `Failed to import team "${roster.teamName}": ${this.runner.messageOf(error)}`,
    });
    return upserted?.team.eras;
  }
}
