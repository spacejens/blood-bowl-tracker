import type {
  ImportError,
  TpRosterImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpRoster, TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpRosterPlayersImportService } from './players/tp-roster-players-import.service';
import { TpTeamUpsertService } from './team/tp-team-upsert.service';
import { TpRosterContextService } from './tp-roster-context.service';

/** Options for {@link TpRosterImportService.importRoster}. */
export interface ImportRosterOptions {
  roster: TpRoster;
  /** The era to import the team under, by name. */
  era: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  /** This roster's players seen only in match snapshots (bulk import only). */
  matchEmbeddedPlayers?: TpRosterPlayer[];
}

/** Options for {@link TpRosterImportService.importRawRoster}. */
export interface ImportRawRosterOptions extends Omit<
  ImportRosterOptions,
  'roster'
> {
  /** One TP roster exactly as TP's API returns it. */
  content: unknown;
}

/**
 * Imports one TP team and its players straight into the database: the
 * shared core of the live import (TpLiveTeamImportService) and the
 * `tpRosters.import` procedure tools/import-tp's bulk run calls once per
 * roster file. A team needs no competition: TP's roster data carries none,
 * and the team is a complete entity on its own. Every failure is reported in
 * the returned results rather than thrown, except an unexpected database
 * error, which propagates to the caller.
 */
@Injectable()
export class TpRosterImportService {
  constructor(
    private readonly rosterParser: RosterParserService,
    private readonly rosterContext: TpRosterContextService,
    private readonly teamUpsert: TpTeamUpsertService,
    private readonly playersImport: TpRosterPlayersImportService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /** {@link importRoster}, for roster JSON not parsed yet. */
  async importRawRoster({
    content,
    ...options
  }: ImportRawRosterOptions): Promise<TpRosterImportResult> {
    let roster: TpRoster;
    try {
      roster = this.rosterParser.parse(content);
    } catch (error) {
      return this.notImported([
        this.importResults.error({
          item: { era: options.era },
          message: `Could not parse TP roster: ${this.runner.messageOf(error)}`,
        }),
      ]);
    }
    return this.importRoster({ roster, ...options });
  }

  /**
   * Resolves the import's context, upserts the team under the era, then
   * upserts its players into that team era. Nothing is imported when the
   * context cannot be resolved, and the players are skipped when the team
   * was not imported.
   */
  async importRoster({
    roster,
    era,
    externalSystemName,
    matchEmbeddedPlayers = [],
  }: ImportRosterOptions): Promise<TpRosterImportResult> {
    const teamErrors: ImportError[] = [];
    const context = await this.rosterContext.resolve({
      roster,
      era,
      externalSystemName,
      errors: teamErrors,
    });
    if (context === undefined) {
      return this.notImported(teamErrors);
    }
    const teamEras = await this.teamUpsert.upsertTeam({
      roster,
      context,
      errors: teamErrors,
    });
    if (teamEras === undefined) {
      return this.notImported(teamErrors);
    }
    const team = this.importResults.result({ imported: 1, errors: teamErrors });

    const playerErrors: ImportError[] = [];
    const teamEra = teamEras.find((row) => row.eraId === context.era.id);
    if (teamEra === undefined) {
      playerErrors.push(
        this.importResults.error({
          item: { rosterId: roster.id, era },
          message: `Skipped the players of roster ${roster.id}: could not resolve its team era for era "${era}"`,
        }),
      );
      return {
        team,
        players: this.importResults.result({
          imported: 0,
          errors: playerErrors,
        }),
        teamEras,
        importedPlayers: [],
        mercenaryPositionUsages: [],
      };
    }

    const players = await this.playersImport.importPlayers({
      roster,
      matchEmbeddedPlayers,
      context,
      teamEraId: teamEra.id,
      errors: playerErrors,
    });
    return {
      team,
      players: this.importResults.result({
        imported: players.imported,
        errors: playerErrors,
      }),
      teamEras,
      importedPlayers: players.importedPlayers,
      mercenaryPositionUsages: players.mercenaryPositionUsages,
    };
  }

  private notImported(teamErrors: ImportError[]): TpRosterImportResult {
    return {
      team: this.importResults.result({ imported: 0, errors: teamErrors }),
      players: this.importResults.result({ imported: 0, errors: [] }),
      teamEras: [],
      importedPlayers: [],
      mercenaryPositionUsages: [],
    };
  }
}
