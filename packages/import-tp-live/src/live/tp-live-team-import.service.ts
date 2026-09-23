import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpRosterImportService } from '../roster/tp-roster-import.service';
import { TP_EXTERNAL_SYSTEM_NAME } from '../tp-external-system';
import { TpImportResultsService } from '../tp-import-results.service';
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
    private readonly rosterImport: TpRosterImportService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Import one team, and its players, from TP's live API: fetch and parse
   * its roster, resolve its era, then upsert it through the same server-side
   * roster import `tpRosters.import` uses, straight into the database. The
   * team needs no competition. Every failure is reported in the returned
   * results, never thrown; the players are skipped when the team itself was
   * not imported.
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

      const { team, players } = await this.rosterImport.importRoster({
        roster,
        era: resolvedEra,
        externalSystemName: TP_EXTERNAL_SYSTEM_NAME,
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
