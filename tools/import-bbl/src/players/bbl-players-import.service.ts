import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  PlayersImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { PlayerPageParser } from './player-page-parser';

const PLAYER_PAGE_TYPE = 'pl';

interface ImportPlayersOptions {
  teamsByCode: Map<string, UpsertTeam>;
  positionIdsByBblId: Map<string, number>;
  racesByBblId: Map<string, { id: number; name: string }>;
  eraIdsByName: Map<string, number>;
}

@Injectable()
export class BblPlayersImportService {
  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly playerPageParser: PlayerPageParser,
    private readonly playersImport: PlayersImportService,
    private readonly teamsImport: TeamsImportService,
    private readonly eraConfig: EraConfigService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly importResults: ImportResultService,
    private readonly pageParseError: PageParseErrorService,
  ) {}

  /**
   * Import every player found on the BBL `p=pl` pages. Each player is resolved
   * to a team era (via its team code + the era whose player-id range contains
   * its pid, or an explicit `playerIdOverrides` entry when the pid is a known
   * boundary exception) and a position (via the composite typId-raceBblId
   * key), then upserted keyed by its pid under the BBL external system only —
   * unlike other entities, players get no Name external id, since player
   * names are not guaranteed unique across the league. Players that cannot be
   * fully resolved are recorded as errors and skipped. Idempotent.
   */
  async importPlayers({
    teamsByCode,
    positionIdsByBblId,
    racesByBblId,
    eraIdsByName,
  }: ImportPlayersOptions): Promise<{
    result: ImportResult;
    playerIdsByPid: Map<string, number>;
    positionsUsedByEra: Set<string>;
    racesActiveByEra: Set<string>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const playerIdsByPid = new Map<string, number>();
    const positionsUsedByEra = new Set<string>();
    const racesActiveByEra = new Set<string>();

    const bblSystemName = this.externalSystemName.getBblSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap(
      [{ name: bblSystemName, category: 'imported_data_source' }],
      'Failed to upsert external system: ',
    );
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: this.importResults.result({ imported, errors }),
        playerIdsByPid,
        positionsUsedByEra,
        racesActiveByEra,
      };
    }
    const [bblSystemId] = bootstrap.ids;

    const eras = this.eraConfig.getEras();
    const raceBblIdByDbId = new Map<number, string>();
    for (const [bblId, info] of racesByBblId) {
      raceBblIdByDbId.set(info.id, bblId);
    }
    const eraByOverriddenPid = new Map<number, (typeof eras)[number]>();
    for (const era of eras) {
      for (const pid of era.players.playerIdOverrides ?? []) {
        eraByOverriddenPid.set(pid, era);
      }
    }
    const eraByOverriddenTeamCode = new Map<string, (typeof eras)[number]>();
    for (const era of eras) {
      for (const teamCode of era.teams?.teamCodeOverrides ?? []) {
        eraByOverriddenTeamCode.set(teamCode, era);
      }
    }

    for await (const page of this.sourceReader.pages(PLAYER_PAGE_TYPE)) {
      try {
        const player = this.playerPageParser.extractPlayer(page);
        if (!player) {
          errors.push(
            this.importResults.error({
              item: { pid: page.params.pid },
              message: `Failed to parse player page for pid "${page.params.pid}": missing pid, <h1>, position link, or team link.`,
            }),
          );
          continue;
        }

        const pidNumber = Number(player.pid);
        const era =
          eraByOverriddenTeamCode.get(player.teamCode) ??
          eraByOverriddenPid.get(pidNumber) ??
          eras.find(
            (e) =>
              e.players.autoAssignByPlayerId &&
              e.players.firstPlayerId !== undefined &&
              pidNumber >= e.players.firstPlayerId &&
              (e.players.lastPlayerId === undefined ||
                pidNumber <= e.players.lastPlayerId),
          );
        if (!era) {
          errors.push(
            this.importResults.error({
              item: { pid: player.pid, name: player.name },
              message: `Skipped player "${player.name}" (${player.pid}): no era range contains this player id`,
            }),
          );
          continue;
        }

        const eraId = eraIdsByName.get(era.identity.name);
        if (eraId === undefined) {
          errors.push(
            this.importResults.error({
              item: { pid: player.pid, era: era.identity.name },
              message: `Skipped player "${player.name}" (${player.pid}): era "${era.identity.name}" not imported`,
            }),
          );
          continue;
        }

        const team = teamsByCode.get(player.teamCode);
        if (!team) {
          errors.push(
            this.importResults.error({
              item: { pid: player.pid, teamCode: player.teamCode },
              message: `Skipped player "${player.name}" (${player.pid}): team "${player.teamCode}" not imported`,
            }),
          );
          continue;
        }

        const upsertedTeam = await this.teamsImport.upsertTeam(
          { ...team, eras: [eraId] },
          errors,
        );
        if (!upsertedTeam) {
          continue;
        }
        const teamEra = upsertedTeam.eras.find((e) => e.eraId === eraId);
        if (!teamEra) {
          errors.push(
            this.importResults.error({
              item: { pid: player.pid, team: team.name, eraId },
              message: `Skipped player "${player.name}" (${player.pid}): could not resolve team era`,
            }),
          );
          continue;
        }

        const raceBblId = raceBblIdByDbId.get(this.resolveDefiniteRaceId(team));
        const positionId =
          raceBblId !== undefined
            ? positionIdsByBblId.get(`${player.typId}-${raceBblId}`)
            : undefined;
        if (positionId === undefined) {
          errors.push(
            this.importResults.error({
              item: {
                pid: player.pid,
                typId: player.typId,
                raceBblId,
              },
              message: `Skipped player "${player.name}" (${player.pid}): no position for ${player.typId}-${raceBblId ?? '?'}`,
            }),
          );
          continue;
        }

        const upserted = await this.playersImport.upsertPlayerResult(
          {
            name: player.name,
            teamEraId: teamEra.id,
            positionId,
            externalIds: [
              { externalSystemId: bblSystemId, externalId: player.pid },
            ],
          },
          errors,
        );
        if (upserted) {
          imported += 1;
          playerIdsByPid.set(player.pid, upserted.id);
          positionsUsedByEra.add(`${positionId}:${eraId}`);
          racesActiveByEra.add(`${team.raceId}:${eraId}`);
        }
      } catch (error) {
        errors.push(this.pageParseError.build(page.params, 'player', error));
        continue;
      }
    }

    return {
      result: this.importResults.result({ imported, errors }),
      playerIdsByPid,
      positionsUsedByEra,
      racesActiveByEra,
    };
  }

  /**
   * Narrow a team upsert's raceId back to a definite number.
   * UpsertTeamSchema.raceId is optional (api-contract, issue #174) to
   * support partial-upsert payloads from other callers, but
   * BblTeamsImportService always resolves raceId before building this
   * upsert -- skipping and recording an error otherwise -- so every
   * UpsertTeam reaching this service has one.
   */
  private resolveDefiniteRaceId(team: UpsertTeam): number {
    if (team.raceId === undefined) {
      throw new Error(
        `Team "${team.name}" has no raceId; import-bbl always resolves raceId before building its upsert.`,
      );
    }
    return team.raceId;
  }
}
