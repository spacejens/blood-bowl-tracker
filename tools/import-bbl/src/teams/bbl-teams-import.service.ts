import type {
  ImportError,
  ImportResult,
  UpsertTeamData,
} from '@blood-bowl-tracker/import';
import {
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { CoachPageParser } from '../coaches/coach-page-parser';
import { RacePageParser } from '../races/race-page-parser';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { TeamPageParser } from './team-page-parser';

const TEAM_PAGE_TYPE = 'tm';

@Injectable()
export class BblTeamsImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly teamPageParser: TeamPageParser,
    private readonly racePageParser: RacePageParser,
    private readonly coachPageParser: CoachPageParser,
    private readonly teamsImport: TeamsImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every team found on the BBL team pages. Each team is keyed by its
   * alphanumeric BBL page id under the BBL external system (canonical) and by
   * its name under the Name external system (cross-tool matching). The team's
   * race and coach foreign keys are resolved from the id maps returned by the
   * races and coaches imports (which must run first). A team whose race or
   * coach cannot be resolved is recorded as an error and skipped rather than
   * upserted with an invalid foreign key. Idempotent: re-running upserts
   * existing teams.
   */
  async importTeams(
    raceIdsByBblId: Map<string, number>,
    coachIdsByName: Map<string, number>,
  ): Promise<{
    result: ImportResult;
    teamRaceIdsByCode: Map<string, number>;
    teamsByName: Map<string, UpsertTeamData>;
    teamsByCode: Map<string, UpsertTeamData>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const teamRaceIdsByCode = new Map<string, number>();
    const teamsByName = new Map<string, UpsertTeamData>();
    const teamsByCode = new Map<string, UpsertTeamData>();

    let bblSystemId: number;
    let nameSystemId: number;
    const bblSystemName = this.externalSystemName.getBblSystemName();
    try {
      bblSystemId =
        await this.externalSystemsImport.upsertExternalSystem(bblSystemName);
      nameSystemId = await this.externalSystemsImport.upsertExternalSystem(
        NAME_EXTERNAL_SYSTEM_NAME,
      );
    } catch (error) {
      errors.push(
        makeImportError({
          item: {
            externalSystems: [bblSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: makeImportResult({ imported, errors }),
        teamRaceIdsByCode,
        teamsByName,
        teamsByCode,
      };
    }

    const seen = new Set<string>();
    for await (const page of this.sourceReader.pages(TEAM_PAGE_TYPE)) {
      try {
        const team = this.teamPageParser.extractTeam(page);
        if (!team || seen.has(team.id)) {
          continue;
        }
        seen.add(team.id);

        const race = this.racePageParser.extractRace(page);
        const coach = this.coachPageParser.extractCoach(page);
        const raceId = race ? raceIdsByBblId.get(race.id) : undefined;
        const coachId = coach ? coachIdsByName.get(coach.name) : undefined;

        if (raceId === undefined) {
          errors.push(
            makeImportError({
              item: { team },
              message: `Failed to import team "${team.name}": could not resolve race`,
            }),
          );
          continue;
        }
        teamRaceIdsByCode.set(team.id, raceId);
        if (coachId === undefined) {
          errors.push(
            makeImportError({
              item: { team },
              message: `Failed to import team "${team.name}": could not resolve coach`,
            }),
          );
          continue;
        }

        const teamData: UpsertTeamData = {
          name: team.name,
          raceId,
          coachId,
          eras: [],
          externalIds: [
            { externalSystemId: bblSystemId, externalId: team.id },
            { externalSystemId: nameSystemId, externalId: team.name },
          ],
        };
        const upserted = await this.teamsImport.upsertTeam(teamData, errors);
        if (upserted) {
          teamsByName.set(team.name, teamData);
          teamsByCode.set(team.id, teamData);
          imported += 1;
        }
      } catch (error) {
        errors.push(
          makeImportError({
            item: { page: page.params },
            message: `Failed to parse team page ${JSON.stringify(page.params)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          }),
        );
        continue;
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      teamRaceIdsByCode,
      teamsByName,
      teamsByCode,
    };
  }
}
