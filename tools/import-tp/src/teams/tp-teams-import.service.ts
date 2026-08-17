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

/** Cross-entity lookups needed to resolve each team's race and coach. */
interface ImportTeamsLookups {
  raceIdsByTeamRaceCode: Map<string, number>;
  coachIdsByTpId: Map<string, number>;
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
   * `id` (TP external id) and its name (Name external id); its race resolves via
   * `raceIdsByTeamRaceCode`, its coach via `coachIdsByTpId`, and its eras
   * server-side, by external id, against whatever TpErasImportService upserted
   * moments earlier in the same run (one batched lookup for the whole run, not
   * one per roster). A team whose race or coach cannot be resolved is recorded
   * as an error and skipped rather than upserted with an invalid foreign key
   * (mirrors BblTeamsImportService). Teams are grouped by id so one seen under
   * multiple eras unions its eras. `rosters` is the already-collected roster
   * list (via `RosterCollectionService`, run once for all three imports); this
   * service only groups and upserts.
   * Also returns `teamErasByRosterId`, mapping each imported team's roster id to
   * the resolved `{ id, eraId }[]` eras from its upsert response — consumed by
   * TpTeamParticipationImportService to resolve a roster id + era id to a
   * team_eras id.
   * `lookups` bundles the cross-entity maps needed to resolve a team's race
   * and coach (kept as one options object to stay within the repo's
   * 3-parameter limit). Idempotent.
   */
  async importTeams(
    rosters: RosterEntry[],
    lookups: ImportTeamsLookups,
  ): Promise<{
    result: ImportResult;
    teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  }> {
    const { raceIdsByTeamRaceCode, coachIdsByTpId } = lookups;
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

    for (const group of groups.values()) {
      const raceId = raceIdsByTeamRaceCode.get(group.teamRaceCode);
      if (raceId === undefined) {
        errors.push(
          this.importResults.error({
            item: { team: group.id, teamRaceCode: group.teamRaceCode },
            message: `Failed to import team "${group.teamName}": could not resolve race for code "${group.teamRaceCode}"`,
          }),
        );
        continue;
      }
      const coachId = coachIdsByTpId.get(group.coachTpId);
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
      const upserted = await this.teamsImport.upsertTeam(data, errors);
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
