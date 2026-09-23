import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpPlayersImportService } from '../roster-import/players/tp-players-import.service';
import { TpTeamsImportService } from '../roster-import/teams/tp-teams-import.service';
import type { TpRosterEntry } from '../tp-roster-entry';
import { TpEraResolutionService } from './tp-era-resolution.service';
import { TpRosterFetchService } from './tp-roster-fetch.service';

/** Options for {@link TpLiveTeamImportService.importTeam}. */
export interface ImportTeamOptions {
  /** TP's roster id for the team: the number in its roster page URL. */
  rosterId: number;
  /**
   * The era to import the team under, by name. Resolved from the team's
   * race's one ongoing era when omitted.
   */
  era?: string;
  /**
   * The scrape-tp session to fetch through, so a caller importing several
   * teams paces them as one visit. A fresh session is started when omitted.
   */
  session?: TpFetchSession;
}

/** What one live team import did. */
export interface TpLiveTeamImportResult {
  /** The team upsert, including any failure before it (fetch, parse, era). */
  team: ImportResult;
  /** The team's players; nothing imported when the team itself was not. */
  players: ImportResult;
}

@Injectable()
export class TpLiveTeamImportService {
  constructor(
    private readonly rosterFetch: TpRosterFetchService,
    private readonly eraResolution: TpEraResolutionService,
    private readonly teamsImport: TpTeamsImportService,
    private readonly playersImport: TpPlayersImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Import one team, and its players, from TP's live API: fetch and parse
   * its roster, resolve its era, then upsert it through the same team and
   * player imports tools/import-tp's bulk run uses. The team needs no
   * competition. Every failure is reported in the returned results, never
   * thrown; the players are skipped when the team itself was not imported.
   */
  async importTeam({
    rosterId,
    era,
    session,
  }: ImportTeamOptions): Promise<TpLiveTeamImportResult> {
    try {
      const errors: ImportError[] = [];
      const roster = await this.rosterFetch.fetchRoster({
        rosterId,
        errors,
        session,
      });
      if (roster === undefined) {
        return this.notImported(errors);
      }
      const resolvedEra = await this.eraResolution.resolveEra({
        roster,
        era,
        errors,
      });
      if (resolvedEra === undefined) {
        return this.notImported(errors);
      }

      const entry: TpRosterEntry = { roster, era: resolvedEra };
      const { result: team, teamErasByRosterId } =
        await this.teamsImport.importTeams([entry]);
      if (!teamErasByRosterId.has(roster.id)) {
        return {
          team,
          players: this.importResults.result({ imported: 0, errors: [] }),
        };
      }
      const { result: players } = await this.playersImport.importPlayers({
        rosters: [entry],
        teamErasByRosterId,
      });
      return { team, players };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.notImported([
        {
          item: { rosterId },
          message: `Unexpected error importing team ${rosterId}: ${message}`,
        },
      ]);
    }
  }

  private notImported(errors: ImportError[]): TpLiveTeamImportResult {
    return {
      team: this.importResults.result({ imported: 0, errors }),
      players: this.importResults.result({ imported: 0, errors: [] }),
    };
  }
}
