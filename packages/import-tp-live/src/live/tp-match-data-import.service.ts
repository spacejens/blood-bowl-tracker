import type {
  ImportError,
  ImportResult,
  TpMatchImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpMatchImportService } from '../match/tp-match-import.service';
import { TpImportResultsService } from '../tp-import-results.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';
import { TpMatchFetchService } from './tp-match-fetch.service';

/** Options for {@link TpMatchDataImportService.importTeams}. */
export interface ImportMatchTeamsOptions {
  /** TP's match id: the number in the match page URL. */
  matchId: number;
  /** The match's tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /**
   * The era to import the home team under, by name; the away team follows
   * the era the home team was imported under. Resolved from the home team's
   * race's one ongoing era when omitted.
   */
  era?: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  /** The scrape-tp session every request is paced through. */
  session: TpFetchSession;
}

/** A fetched, completed match whose two teams are both imported. */
export interface TpMatchReadyToWrite {
  match: TpMatch;
  /** The era both teams were imported under: the home team's. */
  era: string;
}

/** What {@link TpMatchDataImportService.importTeams} did. */
export interface TpMatchTeamsImport {
  /**
   * The match fetch and its completion check: only ever failures, never
   * counted as imported (the match row is written later, if at all).
   */
  matchFetch: ImportResult;
  homeTeam: TpLiveTeamImportResult;
  awayTeam: TpLiveTeamImportResult;
  /**
   * The match and its teams' era, ready to write; undefined when the fetch,
   * the completion check or either team import failed.
   */
  ready: TpMatchReadyToWrite | undefined;
}

/** Options for {@link TpMatchDataImportService.writeMatch}. */
export interface WriteTpMatchOptions {
  match: TpMatch;
  /** The match's tournament's bracket; its competition must already be imported. */
  bracket: TpBracket;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
}

/** Options for {@link TpMatchDataImportService.importMatchData}. */
export interface ImportMatchDataOptions extends ImportMatchTeamsOptions {
  /** The match's tournament's bracket; its competition must already be imported. */
  bracket: TpBracket;
}

/** What importing one match's data did: both teams, then the match's own stages. */
export interface TpMatchDataImportResult extends TpMatchImportResult {
  homeTeam: TpLiveTeamImportResult;
  awayTeam: TpLiveTeamImportResult;
}

/**
 * Imports one already-known TP match's own data live: fetch it by id, refuse
 * it unless completed, import both its teams (the away team in the home
 * team's era), then write it through the same server-side core
 * `tpMatches.import` uses, against a competition already imported. The
 * shared primitive below both the single live match import (which upserts
 * the competition between the two phases) and the completed-matches
 * backfill (which already holds the bracket). Idempotent: every write is an
 * upsert. Failures are reported in the results; only an unexpected error
 * (such as a database failure) propagates, for the caller to catch.
 */
@Injectable()
export class TpMatchDataImportService {
  constructor(
    private readonly matchFetch: TpMatchFetchService,
    private readonly teamImport: TpLiveTeamImportService,
    private readonly matchImport: TpMatchImportService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Fetch the match, refuse it unless it has a recorded result, then import
   * its home team and its away team. A step whose prerequisite failed is
   * not attempted and reports nothing imported.
   */
  async importTeams({
    matchId,
    tournamentSlug,
    era,
    externalSystemName,
    session,
  }: ImportMatchTeamsOptions): Promise<TpMatchTeamsImport> {
    const matchErrors: ImportError[] = [];
    const match = await this.matchFetch.fetchMatch({
      matchId,
      tournamentSlug,
      errors: matchErrors,
      session,
    });
    if (match !== undefined && match.winner === undefined) {
      matchErrors.push(
        this.importResults.error({
          item: { matchId },
          message: `TP match ${matchId} is not completed yet (it has no recorded result); only completed matches are imported.`,
        }),
      );
    }
    const matchFetch = this.importResults.result({
      imported: 0,
      errors: matchErrors,
    });
    if (match === undefined || match.winner === undefined) {
      return {
        matchFetch,
        homeTeam: this.noTeam(),
        awayTeam: this.noTeam(),
        ready: undefined,
      };
    }

    const homeTeam = await this.teamImport.importTeam({
      rosterId: match.homeTeamTpId,
      era,
      externalSystemName,
      session,
      matchEmbeddedPlayers: match.homeRosterPlayers,
    });
    if (homeTeam.era === undefined) {
      return {
        matchFetch,
        homeTeam,
        awayTeam: this.noTeam(),
        ready: undefined,
      };
    }
    const awayTeam = await this.teamImport.importTeam({
      rosterId: match.awayTeamTpId,
      era: homeTeam.era,
      externalSystemName,
      session,
      matchEmbeddedPlayers: match.awayRosterPlayers,
    });
    if (awayTeam.era === undefined) {
      return { matchFetch, homeTeam, awayTeam, ready: undefined };
    }
    return {
      matchFetch,
      homeTeam,
      awayTeam,
      ready: { match, era: homeTeam.era },
    };
  }

  /** Write the match through the shared core, under its bracket's competition. */
  writeMatch({
    match,
    bracket,
    externalSystemName,
  }: WriteTpMatchOptions): Promise<TpMatchImportResult> {
    return this.matchImport.importMatch({
      match,
      bracket: bracket.matches,
      competitionTpId: bracket.tournament.id,
      externalSystemName,
    });
  }

  /**
   * {@link importTeams}, then {@link writeMatch} when both teams were
   * imported. When they were not, the match fetch's result is reported on
   * the match stage and nothing is written.
   */
  async importMatchData({
    bracket,
    ...teamOptions
  }: ImportMatchDataOptions): Promise<TpMatchDataImportResult> {
    const { matchFetch, homeTeam, awayTeam, ready } =
      await this.importTeams(teamOptions);
    if (ready === undefined) {
      return {
        homeTeam,
        awayTeam,
        match: matchFetch,
        participation: this.nothing(),
        events: this.nothing(),
        outcome: this.nothing(),
      };
    }
    const core = await this.writeMatch({
      match: ready.match,
      bracket,
      externalSystemName: teamOptions.externalSystemName,
    });
    return { homeTeam, awayTeam, ...core };
  }

  private nothing(): ImportResult {
    return this.importResults.result({ imported: 0, errors: [] });
  }

  private noTeam(): TpLiveTeamImportResult {
    return {
      team: this.nothing(),
      players: this.nothing(),
      era: undefined,
      teamEra: undefined,
    };
  }
}
