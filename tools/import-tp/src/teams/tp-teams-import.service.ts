import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  externalSystemBootstrapError,
  ExternalSystemsImportService,
  makeImportError,
  makeImportResult,
  TeamsImportService,
  upsertExternalSystems,
} from '@blood-bowl-tracker/import';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import {
  collectRosters,
  unknownEraError,
} from '../races/tp-races-import.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NAME_EXTERNAL_SYSTEM_NAME } from '../source/external-system-names';
import { TpSourceReader } from '../source/tp-source-reader';

/** One team (keyed by roster id), accumulated across its roster files. */
interface TeamGroup {
  id: number;
  teamName: string;
  teamRaceCode: string;
  coachTpId: string;
  eraIds: Set<number>;
}

@Injectable()
export class TpTeamsImportService {
  constructor(
    private readonly sourceReader: TpSourceReader,
    private readonly rosterParser: RosterParserService,
    private readonly teamsImport: TeamsImportService,
    private readonly externalSystemsImport: ExternalSystemsImportService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Import every team from the TP roster files. A team is keyed by its roster
   * `id` (TP external id) and its name (Name external id); its race resolves via
   * `raceIdsByTeamRaceCode` and its coach via `coachIdsByTpId`. A team whose race
   * or coach cannot be resolved is recorded as an error and skipped rather than
   * upserted with an invalid foreign key (mirrors BblTeamsImportService). Teams
   * are grouped by id so one seen under multiple eras unions its eras.
   * Idempotent.
   */
  async importTeams(
    raceIdsByTeamRaceCode: Map<string, number>,
    coachIdsByTpId: Map<string, number>,
    eraIdsByName: Map<string, number>,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    let tpSystemId: number;
    let nameSystemId: number;
    const tpSystemName = this.externalSystemName.getTpSystemName();
    try {
      [tpSystemId, nameSystemId] = await upsertExternalSystems(
        this.externalSystemsImport,
        [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME],
      );
    } catch (error) {
      errors.push(
        externalSystemBootstrapError(
          [tpSystemName, NAME_EXTERNAL_SYSTEM_NAME],
          error,
        ),
      );
      return { result: makeImportResult({ imported, errors }) };
    }

    const rosters = await collectRosters(
      this.sourceReader,
      this.rosterParser,
      errors,
    );

    const groups = new Map<number, TeamGroup>();
    for (const { roster, era } of rosters) {
      let group = groups.get(roster.id);
      if (!group) {
        group = {
          id: roster.id,
          teamName: roster.teamName,
          teamRaceCode: roster.teamRaceCode,
          coachTpId: roster.coachTpId,
          eraIds: new Set(),
        };
        groups.set(roster.id, group);
      }
      const eraId = eraIdsByName.get(era);
      if (eraId === undefined) {
        errors.push(unknownEraError(era, roster));
      } else {
        group.eraIds.add(eraId);
      }
    }

    for (const group of groups.values()) {
      const raceId = raceIdsByTeamRaceCode.get(group.teamRaceCode);
      if (raceId === undefined) {
        errors.push(
          makeImportError({
            item: { team: group.id, teamRaceCode: group.teamRaceCode },
            message: `Failed to import team "${group.teamName}": could not resolve race for code "${group.teamRaceCode}"`,
          }),
        );
        continue;
      }
      const coachId = coachIdsByTpId.get(group.coachTpId);
      if (coachId === undefined) {
        errors.push(
          makeImportError({
            item: { team: group.id, coachTpId: group.coachTpId },
            message: `Failed to import team "${group.teamName}": could not resolve coach "${group.coachTpId}"`,
          }),
        );
        continue;
      }

      const data: UpsertTeam = {
        name: group.teamName,
        raceId,
        coachId,
        eras: [...group.eraIds],
        externalIds: [
          { externalSystemId: tpSystemId, externalId: String(group.id) },
          { externalSystemId: nameSystemId, externalId: group.teamName },
        ],
      };
      const upserted = await this.teamsImport.upsertTeam(data, errors);
      if (upserted) {
        imported += 1;
      }
    }

    return { result: makeImportResult({ imported, errors }) };
  }
}
