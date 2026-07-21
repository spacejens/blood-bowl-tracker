import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  PlayersImportService,
} from '@blood-bowl-tracker/import';
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
}

@Injectable()
export class TpPlayersImportService {
  constructor(
    private readonly playersImport: PlayersImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
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
   * `matchEvents[].lineUpId` to a player's DB id. Idempotent.
   */
  async importPlayers({
    rosters,
    teamErasByRosterId,
    eraIdsByName,
    positionIdsByTpPositionId,
  }: ImportPlayersOptions): Promise<{
    result: ImportResult;
    playerIdsByLineUpId: Map<number, number>;
  }> {
    let imported = 0;
    const errors: ImportError[] = [];
    const playerIdsByLineUpId = new Map<number, number>();

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      tpSystemName,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return {
        result: makeImportResult({ imported, errors }),
        playerIdsByLineUpId,
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

    return {
      result: makeImportResult({ imported, errors }),
      playerIdsByLineUpId,
    };
  }
}
