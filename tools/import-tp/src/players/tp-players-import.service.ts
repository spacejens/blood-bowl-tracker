import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  makeImportError,
  makeImportResult,
  PlayersImportService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import type {
  TpInducedStarPlayer,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { unknownEraError } from '../source/roster-collection.service';

/**
 * One hired-star-player group: the roster that hired them, the real era the
 * hiring match's competition belongs to (so a roster id spanning multiple
 * eras, per `TpTeamsImportService`'s era-union grouping, resolves its team
 * era unambiguously instead of guessing), and the star players themselves.
 */
export interface InducedStarPlayerHireGroup {
  rosterId: number;
  eraId: number;
  starPlayers: TpInducedStarPlayer[];
}

/** Options for {@link TpPlayersImportService.importPlayers}, bundled into one
 * object to stay within the repo's 3-parameter limit. */
export interface ImportPlayersOptions {
  rosters: RosterEntry[];
  teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  eraIdsByName: Map<string, number>;
  positionIdsByTpPositionId: Map<number, number>;
  /**
   * Star players hired via an `inducements_roll` match event, grouped by
   * hiring roster id AND real era id (pre-scanned by `main.ts` from
   * `matchesByCompetitionId` so this service stays the single owner of the
   * player-resolution maps). Optional -- callers/tests that don't exercise
   * star players can omit it.
   */
  inducedStarPlayerHireGroups?: InducedStarPlayerHireGroup[];
  /**
   * Players seen in match-embedded roster snapshots
   * (`TpMatch.homeRosterPlayers`/`awayRosterPlayers`), grouped by roster id
   * (pre-scanned by `main.ts` from `matchesByCompetitionId`, so this service
   * stays the single owner of the player-resolution maps). A standalone
   * `rosters_<id>.json` file only reflects a roster's CURRENT composition as
   * of when the local TP data mirror was downloaded, so a player who has
   * since left/been replaced is silently absent from it even though
   * historical `matchEvents[]` can still reference them — this map fills
   * that gap. Optional -- callers/tests that don't exercise this path can
   * omit it, matching the existing `inducedStarPlayerHireGroups?` pattern.
   */
  matchEmbeddedPlayersByRosterId?: Map<number, TpRosterPlayer[]>;
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
   * Each roster's player list is first merged with any entry in
   * `matchEmbeddedPlayersByRosterId` for that roster id: the match-embedded
   * snapshot fills in player ids absent from the standalone roster file (a
   * departed player), while the standalone file's own data wins for any id
   * it lists (presumed freshest). See `matchEmbeddedPlayersByRosterId`'s doc
   * comment for why this union is needed.
   *
   * Also imports every star player named in `inducedStarPlayerHireGroups`
   * (hired via an `inducements_roll` event, not part of a roster's permanent
   * `lineUps[]`): each named star player gets one reused `isStarPlayer: true`
   * Position (bare-name external id, mirroring
   * `BblPositionsImportService`'s star-player handling) and a Player scoped
   * to the hiring roster's team-era, resolved directly from the group's own
   * `eraId` (the real era the hiring match's competition belongs to) --
   * mirroring how `TpTeamParticipationImportService.resolveTeamEraId`
   * resolves a roster id + era id to its team_eras id. Returns
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
    inducedStarPlayerHireGroups,
    matchEmbeddedPlayersByRosterId,
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

      // Merge the match-embedded roster snapshot into the standalone
      // roster's players, keyed by player id: start from the
      // match-embedded entries (a departed player, absent from
      // roster.players, may only exist here), then overlay roster.players
      // so the standalone file's data wins for any id it lists.
      const mergedPlayers = new Map<number, (typeof roster.players)[number]>(
        (matchEmbeddedPlayersByRosterId?.get(roster.id) ?? []).map((player) => [
          player.id,
          player,
        ]),
      );
      for (const player of roster.players) {
        mergedPlayers.set(player.id, player);
      }

      for (const player of mergedPlayers.values()) {
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

    if (inducedStarPlayerHireGroups) {
      const seenStarPlayerKeys = new Set<string>();
      for (const {
        rosterId,
        eraId,
        starPlayers,
      } of inducedStarPlayerHireGroups) {
        const teamEra = teamErasByRosterId
          .get(rosterId)
          ?.find((te) => te.eraId === eraId);
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
}
