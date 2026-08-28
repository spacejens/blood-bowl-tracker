import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  ReferenceLookupService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraDataConfigService } from '../eras/era-data-config.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { RosterCollectionService } from '../source/roster-collection.service';

/**
 * One team (keyed by roster id), accumulated across its roster files.
 * `teamName`/`teamRaceCode`/`coachTpId` are taken from the FIRST roster file
 * seen for this id; if TP ever reuses a roster id across a rename or race
 * change, only those first-seen values are kept -- only `eraIds` accumulates
 * across later files.
 */
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
    private readonly teamsImport: TeamsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly rosterCollection: RosterCollectionService,
    private readonly importResults: ImportResultService,
    private readonly eraDataConfig: EraDataConfigService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  /**
   * Import every team from the TP roster files. A team is keyed by its roster
   * `id` (TP external id) and its name (Name external id); its race and coach
   * resolve server-side, by external id, against whatever the races and
   * coaches imports upserted moments earlier in the same run (one batched
   * lookup per kind for the whole run, not one per team), and its eras the
   * same way against whatever TpErasImportService upserted. A team whose race
   * or coach cannot be resolved is recorded as an error and skipped rather
   * than upserted with an invalid foreign key (mirrors BblTeamsImportService).
   * Teams are grouped by id so one seen under multiple eras unions its eras.
   * `rosters` is the already-collected roster list (via
   * `RosterCollectionService`, run once for all three imports); this service
   * only groups and upserts.
   * Also returns `teamErasByRosterId`, mapping each imported team's roster id to
   * the resolved `{ id, eraId }[]` eras from its upsert response — consumed by
   * TpTeamParticipationImportService to resolve a roster id + era id to a
   * team_eras id. Idempotent.
   */
  async importTeams(rosters: RosterEntry[]): Promise<{
    result: ImportResult;
    teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const teamErasByRosterId = new Map<
      number,
      { id: number; eraId: number }[]
    >();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        teamErasByRosterId,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    let eraNames: string[];
    try {
      eraNames = [
        ...new Set(this.eraDataConfig.getEras().map((era) => era.name)),
      ];
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { externalSystems: [tpSystemName] },
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        result: this.importResults.result({ imported, errors }),
        teamErasByRosterId,
      };
    }
    const eraIds = await this.lookup.lookupMap(
      'era',
      eraNames.map((name) => ({
        externalSystemId: tpSystemId,
        externalId: name,
      })),
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
      const eraId = eraIds.get(
        this.lookup.keyOf({ externalSystemId: tpSystemId, externalId: era }),
      );
      if (eraId === undefined) {
        errors.push(this.rosterCollection.unknownEraError(era, roster));
      } else {
        group.eraIds.add(eraId);
      }
    }

    const [raceIds, coachIds] = await Promise.all([
      this.lookup.lookupMap(
        'race',
        [...new Set([...groups.values()].map((g) => g.teamRaceCode))].map(
          (code) => ({ externalSystemId: tpSystemId, externalId: code }),
        ),
      ),
      this.lookup.lookupMap(
        'coach',
        [...new Set([...groups.values()].map((g) => g.coachTpId))].map(
          (id) => ({
            externalSystemId: tpSystemId,
            externalId: id,
          }),
        ),
      ),
    ]);

    for (const group of groups.values()) {
      const raceId = raceIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: group.teamRaceCode,
        }),
      );
      if (raceId === undefined) {
        errors.push(
          this.importResults.error({
            item: { team: group.id, teamRaceCode: group.teamRaceCode },
            message: `Failed to import team "${group.teamName}": could not resolve race for code "${group.teamRaceCode}"`,
          }),
        );
        continue;
      }
      const coachId = coachIds.get(
        this.lookup.keyOf({
          externalSystemId: tpSystemId,
          externalId: group.coachTpId,
        }),
      );
      if (coachId === undefined) {
        errors.push(
          this.importResults.error({
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
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forTeam(group.teamName),
          },
        ],
      };
      const upserted = await this.teamsImport.upsert(data, errors);
      if (upserted) {
        teamErasByRosterId.set(group.id, upserted.eras);
        imported += 1;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      teamErasByRosterId,
    };
  }
}
