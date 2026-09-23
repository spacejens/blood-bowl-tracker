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
import { Inject, Injectable } from '@nestjs/common';

import type { TpExternalSystemNameProvider } from '../../tp-import-providers';
import { TP_EXTERNAL_SYSTEM_NAME_PROVIDER } from '../../tp-import-providers';
import type { TpRosterEntry } from '../../tp-roster-entry';
import { TpRosterEraErrorService } from '../tp-roster-era-error.service';

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
    @Inject(TP_EXTERNAL_SYSTEM_NAME_PROVIDER)
    private readonly externalSystemName: TpExternalSystemNameProvider,
    private readonly nameExternalId: NameExternalIdService,
    private readonly rosterEraErrors: TpRosterEraErrorService,
    private readonly importResults: ImportResultService,
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
   * `rosters` is the already-collected roster list — every roster file from
   * tools/import-tp's bulk run, or the one roster a live import fetched; this
   * service only groups and upserts. Only the eras those rosters are under
   * are resolved.
   * Also returns `teamErasByRosterId`, mapping each imported team's roster id to
   * the resolved `{ id, eraId }[]` eras from its upsert response — consumed by
   * TpTeamParticipationImportService to resolve a roster id + era id to a
   * team_eras id. Idempotent.
   */
  async importTeams(rosters: TpRosterEntry[]): Promise<{
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

    // Only the eras these rosters are under: a bulk run passes every roster's
    // real era, a live import only the one era it resolved.
    const eraNames = [...new Set(rosters.map((entry) => entry.era))];
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
        errors.push(this.rosterEraErrors.unknownEraError(era, roster));
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
