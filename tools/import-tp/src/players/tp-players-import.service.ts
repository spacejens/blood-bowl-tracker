import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  PlayersImportService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import type { TpInducedStarPlayer } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { unknownEraError } from '../source/roster-collection.service';

/** Options for {@link TpPlayersImportService.importPlayers}, bundled into one
 * object to stay within the repo's 3-parameter limit. */
export interface ImportPlayersOptions {
  rosters: RosterEntry[];
  teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  eraIdsByName: Map<string, number>;
  positionIdsByTpPositionId: Map<number, number>;
  /**
   * Star players hired via an `inducements_roll` match event, grouped by the
   * hiring roster id (pre-scanned by `main.ts` from `matchesByCompetitionId`
   * so this service stays the single owner of the player-resolution maps).
   * Optional -- callers/tests that don't exercise star players can omit it.
   */
  inducedStarPlayersByRosterId?: Map<number, TpInducedStarPlayer[]>;
}

@Injectable()
export class TpPlayersImportService {
  constructor(
    private readonly playersImport: PlayersImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly positionsImport: PositionsImportService,
  ) {}

  /**
   * Import every player instance from the TP roster files' `lineUps[]`. Each
   * player resolves to a team era (via its roster's `teamErasByRosterId`
   * entry whose `eraId` matches the roster's era) and a position (via its
   * `lineUpMasterId` looked up in `positionIdsByTpPositionId`, the map
   * TpPositionsImportService returns from its own upserts). A player whose
   * team era or position cannot be resolved is recorded as a non-fatal error
   * and skipped rather than upserted with an invalid foreign key (mirrors
   * BblPlayersImportService). Players get NO Name external id -- only the TP
   * lineUpId -- since player names are not guaranteed unique. Returns
   * `playerIdsByLineUpId`, consumed by the match-events step to resolve a
   * `matchEvents[].lineUpId` to a player's DB id.
   *
   * Also imports every star player named in `inducedStarPlayersByRosterId`
   * (hired via an `inducements_roll` event, not part of a roster's permanent
   * `lineUps[]`): each named star player gets one reused `isStarPlayer: true`
   * Position (bare-name external id, mirroring
   * `BblPositionsImportService`'s star-player handling) and a Player scoped
   * to the hiring roster's team-era. Returns
   * `starPlayerIdsByRosterAndMaster`, keyed by `` `${rosterId}:${lineUpMasterId}` ``
   * (star players are referenced in match events by `lineUpMasterId` within
   * a roster, not by a `lineUps[].id`), consumed by the match-events step
   * when a `lineUpId` doesn't resolve via `playerIdsByLineUpId`. Idempotent.
   */
  async importPlayers({
    rosters,
    teamErasByRosterId,
    eraIdsByName,
    positionIdsByTpPositionId,
    inducedStarPlayersByRosterId,
  }: ImportPlayersOptions): Promise<{
    result: ImportResult;
    playerIdsByLineUpId: Map<number, number>;
    starPlayerIdsByRosterAndMaster: Map<string, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const playerIdsByLineUpId = new Map<number, number>();
    const starPlayerIdsByRosterAndMaster = new Map<string, number>();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      tpSystemName,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: makeImportResult({ imported, errors }),
        playerIdsByLineUpId,
        starPlayerIdsByRosterAndMaster,
      };
    }
    const [tpSystemId] = bootstrap.ids;

    for (const { roster, era } of rosters) {
      const eraId = eraIdsByName.get(era);
      if (eraId === undefined) {
        errors.push(unknownEraError(era, roster));
      }

      for (const player of roster.players) {
        const teamEras = teamErasByRosterId.get(roster.id);
        const teamEra = teamEras?.find((te) => te.eraId === eraId);
        if (teamEra === undefined) {
          errors.push(
            makeImportError({
              item: { player: player.id, rosterId: roster.id, era },
              message: `Skipped player "${player.name}" (${player.id}): could not resolve team era for roster ${roster.id} in era "${era}"`,
            }),
          );
          continue;
        }

        const positionId = positionIdsByTpPositionId.get(player.lineUpMasterId);
        if (positionId === undefined) {
          errors.push(
            makeImportError({
              item: {
                player: player.id,
                lineUpMasterId: player.lineUpMasterId,
              },
              message: `Skipped player "${player.name}" (${player.id}): could not resolve position for lineUpMasterId ${player.lineUpMasterId}`,
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
              { externalSystemId: tpSystemId, externalId: String(player.id) },
            ],
          },
          errors,
        );
        if (upserted) {
          imported += 1;
          playerIdsByLineUpId.set(player.id, upserted.id);
        }
      }
    }

    if (inducedStarPlayersByRosterId) {
      const seenStarPlayerKeys = new Set<string>();
      for (const [rosterId, starPlayers] of inducedStarPlayersByRosterId) {
        const teamEra = TpPlayersImportService.resolveHiringTeamEra({
          rosterId,
          teamErasByRosterId,
          rosters,
          eraIdsByName,
        });
        if (teamEra === undefined) {
          errors.push(
            makeImportError({
              item: { rosterId },
              message: `Skipped ${starPlayers.length} hired star player(s) for roster ${rosterId}: could not resolve hiring team era`,
            }),
          );
          continue;
        }

        for (const starPlayer of starPlayers) {
          const key = `${rosterId}:${starPlayer.lineUpMasterId}`;
          if (seenStarPlayerKeys.has(key)) {
            continue;
          }
          seenStarPlayerKeys.add(key);

          const position = await this.positionsImport.upsertPosition(
            {
              name: starPlayer.name,
              isStarPlayer: true,
              externalIds: [
                { externalSystemId: tpSystemId, externalId: starPlayer.name },
              ],
            },
            errors,
          );
          if (!position) {
            continue;
          }

          const upserted = await this.playersImport.upsertPlayerResult(
            {
              name: starPlayer.name,
              teamEraId: teamEra.id,
              positionId: position.id,
              externalIds: [
                {
                  externalSystemId: tpSystemId,
                  externalId: `star-${rosterId}-${starPlayer.lineUpMasterId}`,
                },
              ],
            },
            errors,
          );
          if (upserted) {
            imported += 1;
            starPlayerIdsByRosterAndMaster.set(key, upserted.id);
          }
        }
      }
    }

    return {
      result: makeImportResult({ imported, errors }),
      playerIdsByLineUpId,
      starPlayerIdsByRosterAndMaster,
    };
  }

  /**
   * Resolve the team-era a hired star player's roster belongs to. Most
   * rosters have exactly one team-era entry, so that's used directly; a
   * roster id spanning multiple eras (per `TpTeamsImportService`'s grouping)
   * is disambiguated via the roster's own era, looked up the same way the
   * regular roster-player pass does. Returns `undefined` if unresolvable
   * either way.
   */
  private static resolveHiringTeamEra({
    rosterId,
    teamErasByRosterId,
    rosters,
    eraIdsByName,
  }: {
    rosterId: number;
    teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
    rosters: RosterEntry[];
    eraIdsByName: Map<string, number>;
  }): { id: number; eraId: number } | undefined {
    const teamEras = teamErasByRosterId.get(rosterId);
    if (!teamEras || teamEras.length === 0) {
      return undefined;
    }
    if (teamEras.length === 1) {
      return teamEras[0];
    }
    const rosterEntry = rosters.find((r) => r.roster.id === rosterId);
    const eraId = rosterEntry ? eraIdsByName.get(rosterEntry.era) : undefined;
    return teamEras.find((te) => te.eraId === eraId);
  }
}
