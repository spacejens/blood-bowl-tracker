import type {
  ImportError,
  TeamEra,
  UpsertCoach,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import {
  UpsertCoachSchema,
  UpsertTeamSchema,
} from '@blood-bowl-tracker/api-contract';
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
   * resolves by TP race code. Its coach is upserted from the roster's own
   * coach id and name — created when unknown, its name refreshed when known
   * — so a coach never imported before does not block the team. A blank
   * (trimmed-empty) coach name omits both the `name` field and the Name
   * external id from the upsert, so an already-known coach still resolves
   * by TP id alone without its stored name or Name-system identity being
   * corrupted to an empty string. A team whose
   * race cannot be resolved, or whose coach upsert fails, is recorded as an
   * error and skipped rather than upserted with an invalid foreign key. The
   * race resolve and coach upsert run in parallel, so a coach can still be
   * created or refreshed even when the race then turns out unresolvable and
   * the team is skipped — intentional: the coach is a valid entity in its
   * own right, and a later import of the same roster converges once the
   * race is resolvable.
   * Returns every team era the team now has — the era sync only ever adds,
   * so an era an earlier import linked stays linked — or undefined when
   * nothing was upserted.
   */
  async upsertTeam({
    roster,
    context,
    errors,
  }: UpsertTeamOptions): Promise<TeamEra[] | undefined> {
    const coachData: UpsertCoach = {
      ...(roster.coachName === '' ? {} : { name: roster.coachName }),
      externalIds: [
        {
          externalSystemId: context.tpSystemId,
          externalId: roster.coachTpId,
        },
        ...(roster.coachName === ''
          ? []
          : [
              {
                externalSystemId: context.nameSystemId,
                externalId: this.nameExternalId.forCoach(roster.coachName),
              },
            ]),
      ],
    };
    const [race, coachUpsert] = await Promise.all([
      this.races.resolve({
        externalSystemId: context.tpSystemId,
        externalId: roster.teamRaceCode,
      }),
      // Parsed through the contract schema, like the team below, so a
      // direct call is held to the same validation an RPC call would be.
      this.runner.record({
        run: () => this.coaches.upsert(UpsertCoachSchema.parse(coachData)),
        item: {
          team: roster.id,
          coachTpId: roster.coachTpId,
          coachName: roster.coachName,
        },
        errors,
        buildErrorMessage: (error) =>
          `Failed to import team "${roster.teamName}": could not import coach "${roster.coachName}": ${this.runner.messageOf(error)}`,
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
    if (coachUpsert === undefined) {
      // The runner already recorded the coach failure.
      return undefined;
    }

    const data: UpsertTeam = {
      name: roster.teamName,
      raceId: race.id,
      coachId: coachUpsert.coach.id,
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
