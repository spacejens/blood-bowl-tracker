import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  TpMatchEmbeddedPlayer,
  TpMercenaryPositionUsage,
  TpRosterImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ImportRunnerService,
} from '@blood-bowl-tracker/import';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';

/** Options for {@link TpRosterFilesImportService.importRosterFiles}. */
export interface ImportRosterFilesOptions {
  rosters: RosterEntry[];
  /** Players seen only in match snapshots, by roster id (from main.ts). */
  matchEmbeddedPlayersByRosterId: Map<number, TpRosterPlayer[]>;
}

/** What importing every roster file did, plus what later steps resolve by. */
export interface RosterFilesImportOutcome {
  teamResult: ImportResult;
  playerResult: ImportResult;
  /** Each imported team's team eras, by roster id. */
  teamErasByRosterId: Map<number, { id: number; eraId: number }[]>;
  /** DB player id by TP `lineUps[].id`, for the match-events step. */
  playerIdsByLineUpId: Map<number, number>;
  /** Players this run inserted, for the lasting-injury history backfill. */
  insertedPlayerIds: number[];
  mercenaryPositionUsages: TpMercenaryPositionUsage[];
}

@Injectable()
export class TpRosterFilesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
    private readonly importResults: ImportResultService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Imports every roster file through `tpRosters.import`: its raw content,
   * the era its directory belongs to, and the roster's match-snapshot-only
   * players. The server parses the roster and upserts the team and its
   * players. A roster file appears under every competition its team played
   * in, so each (era, roster) pair is sent once, first file seen. A team
   * seen under several eras is imported once per era; the server's era sync
   * only ever adds, so its team eras accumulate across those calls.
   */
  async importRosterFiles({
    rosters,
    matchEmbeddedPlayersByRosterId,
  }: ImportRosterFilesOptions): Promise<RosterFilesImportOutcome> {
    const externalSystemName = this.externalSystemName.getTpSystemName();
    const teamErrors: ImportError[] = [];
    const seenTeamErrors = new Set<string>();
    const playerErrors: ImportError[] = [];
    const seenPlayerErrors = new Set<string>();
    let teamsImported = 0;
    let playersImported = 0;
    const teamErasByRosterId = new Map<
      number,
      { id: number; eraId: number }[]
    >();
    const playerIdsByLineUpId = new Map<number, number>();
    const insertedPlayerIds: number[] = [];
    const mercenaryPositionUsages: TpMercenaryPositionUsage[] = [];

    for (const entry of this.distinctByEraAndRoster(rosters)) {
      const rosterId = entry.roster.id;
      const outcome: TpRosterImportResult | undefined =
        await this.importRunner.recordUpsertResult({
          upsert: () =>
            this.client.tpRosters.import({
              roster: entry.content,
              era: entry.era,
              externalSystemName,
              matchEmbeddedPlayers: (
                matchEmbeddedPlayersByRosterId.get(rosterId) ?? []
              ).map((player) => this.toMatchEmbeddedPlayer(player)),
            }),
          item: { rosterId, era: entry.era },
          errors: teamErrors,
          buildErrorMessage: (err) =>
            `Failed to import roster ${rosterId} (era "${entry.era}"): ${err instanceof Error ? err.message : String(err)}`,
        });
      if (outcome === undefined) {
        continue;
      }
      teamsImported += outcome.team.imported;
      this.pushDistinct(teamErrors, seenTeamErrors, outcome.team.errors);
      playersImported += outcome.players.imported;
      this.pushDistinct(playerErrors, seenPlayerErrors, outcome.players.errors);
      if (outcome.teamEras.length > 0) {
        const known = teamErasByRosterId.get(rosterId) ?? [];
        const knownIds = new Set(known.map((row) => row.id));
        teamErasByRosterId.set(rosterId, [
          ...known,
          ...outcome.teamEras.filter((row) => !knownIds.has(row.id)),
        ]);
      }
      for (const player of outcome.importedPlayers) {
        playerIdsByLineUpId.set(player.lineUpId, player.playerId);
        if (player.created) {
          insertedPlayerIds.push(player.playerId);
        }
      }
      mercenaryPositionUsages.push(...outcome.mercenaryPositionUsages);
    }

    return {
      teamResult: this.importResults.result({
        imported: teamsImported,
        errors: teamErrors,
      }),
      playerResult: this.importResults.result({
        imported: playersImported,
        errors: playerErrors,
      }),
      teamErasByRosterId,
      playerIdsByLineUpId,
      insertedPlayerIds,
      mercenaryPositionUsages,
    };
  }

  /**
   * Appends each error unless an identical one (same item and message) was
   * already recorded. A single misconfigured era, or a mercenary position
   * with no curated row, is reported once per `tpRosters.import` call, so
   * without this an ambiguous era with N rosters would repeat its error N
   * times in the run's summary.
   */
  private pushDistinct(
    target: ImportError[],
    seen: Set<string>,
    errors: ImportError[],
  ): void {
    for (const error of errors) {
      const key = JSON.stringify([error.item, error.message]);
      if (!seen.has(key)) {
        seen.add(key);
        target.push(error);
      }
    }
  }

  private distinctByEraAndRoster(rosters: RosterEntry[]): RosterEntry[] {
    const byKey = new Map<string, RosterEntry>();
    for (const entry of rosters) {
      const key = `${entry.era}\t${entry.roster.id}`;
      if (!byKey.has(key)) {
        byKey.set(key, entry);
      }
    }
    return [...byKey.values()];
  }

  /** Only the fields a match snapshot entry carries go over the wire. */
  private toMatchEmbeddedPlayer(player: TpRosterPlayer): TpMatchEmbeddedPlayer {
    return {
      id: player.id,
      name: player.name,
      number: player.number,
      lineUpMasterId: player.lineUpMasterId,
      rosterId: player.rosterId,
      fallbackPositionName: player.fallbackPositionName,
      isBigGuy: player.isBigGuy,
      totalStarPlayerPoints: player.totalStarPlayerPoints,
    };
  }
}
