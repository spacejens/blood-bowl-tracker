import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { CoachPageParser } from '../coaches/coach-page-parser';
import { RacePageParser } from '../races/race-page-parser';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
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
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly pageParseError: PageParseErrorService,
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
    teamsByName: Map<string, UpsertTeam>;
    teamsByCode: Map<string, UpsertTeam>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const teamRaceIdsByCode = new Map<string, number>();
    const teamsByName = new Map<string, UpsertTeam>();
    const teamsByCode = new Map<string, UpsertTeam>();

    const bblSystemName = this.externalSystemName.getBblSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: bblSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        teamRaceIdsByCode,
        teamsByName,
        teamsByCode,
      };
    }
    const [bblSystemId, nameSystemId] = bootstrap.ids;

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
            this.importResults.error({
              item: { team },
              message: `Failed to import team "${team.name}": could not resolve race`,
            }),
          );
          continue;
        }
        teamRaceIdsByCode.set(team.id, raceId);
        if (coachId === undefined) {
          errors.push(
            this.importResults.error({
              item: { team },
              message: `Failed to import team "${team.name}": could not resolve coach`,
            }),
          );
          continue;
        }

        const teamData: UpsertTeam = {
          name: team.name,
          raceId,
          coachId,
          eras: [],
          externalIds: [
            { externalSystemId: bblSystemId, externalId: team.id },
            {
              externalSystemId: nameSystemId,
              externalId: this.nameExternalId.forTeam(team.name),
            },
          ],
        };
        const upserted = await this.teamsImport.upsertTeam(teamData, errors);
        if (upserted) {
          teamsByName.set(team.name, teamData);
          teamsByCode.set(team.id, teamData);
          imported += 1;
        }
      } catch (error) {
        errors.push(this.pageParseError.build(page.params, 'team', error));
        continue;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      teamRaceIdsByCode,
      teamsByName,
      teamsByCode,
    };
  }
}
