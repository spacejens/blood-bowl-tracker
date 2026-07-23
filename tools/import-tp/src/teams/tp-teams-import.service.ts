import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { unknownEraError } from '../source/roster-collection.service';

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

/** Cross-entity lookups needed to resolve each team's race, coach and eras. */
interface ImportTeamsLookups {
  raceIdsByTeamRaceCode: Map<string, number>;
  coachIdsByTpId: Map<string, number>;
  eraIdsByName: Map<string, number>;
}

@Injectable()
export class TpTeamsImportService {
  constructor(
    private readonly teamsImport: TeamsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
  ) {}

  /**
   * Import every team from the TP roster files. A team is keyed by its roster
   * `id` (TP external id) and its name (Name external id); its race resolves via
   * `raceIdsByTeamRaceCode` and its coach via `coachIdsByTpId`. A team whose race
   * or coach cannot be resolved is recorded as an error and skipped rather than
   * upserted with an invalid foreign key (mirrors BblTeamsImportService). Teams
   * are grouped by id so one seen under multiple eras unions its eras. `rosters`
   * is the already-collected roster list (via `RosterCollectionService`, run
   * once for all three imports); this service only groups and upserts.
   * Also returns `teamErasByRosterId`, mapping each imported team's roster id to
   * the resolved `{ id, eraId }[]` eras from its upsert response — consumed by
   * TpTeamParticipationImportService to resolve a roster id + era id to a
   * team_eras id.
   * `lookups` bundles the three cross-entity maps needed to resolve a team's
   * race, coach and eras (kept as one options object to stay within the
   * repo's 3-parameter limit). Idempotent.
   */
  async importTeams(
    rosters: RosterEntry[],
    lookups: ImportTeamsLookups,
  ): Promise<{
    result: ImportResult;
    teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  }> {
    const { raceIdsByTeamRaceCode, coachIdsByTpId, eraIdsByName } = lookups;
    let imported = 0;
    const errors: ImportError[] = [];
    const teamErasByRosterId = new Map<
      number,
      { id: number; eraId: number }[]
    >();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, isBookkeeping: false },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: makeImportResult({ imported, errors }),
        teamErasByRosterId,
      };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

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
      result: makeImportResult({ imported, errors }),
      teamErasByRosterId,
    };
  }
}
