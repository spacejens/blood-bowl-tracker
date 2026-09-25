import type {
  TpLiveCompetitionImportResult,
  TpLiveMatchImportResult,
  TpLiveOfficialTeamsImportResult,
  TpLiveTeamImportResult,
} from '@blood-bowl-tracker/import-tp-live';
import {
  TpLiveCompetitionImportService,
  TpLiveMatchImportService,
  TpLiveOfficialTeamsImportService,
  TpLiveTeamImportService,
} from '@blood-bowl-tracker/import-tp-live';
import type { TpPageClassification } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { DiscordBotConfigService } from '../../discord-bot-config.service';

/** A classified TP page this bot knows how to import. */
export type ImportableTpPage = Exclude<
  TpPageClassification,
  { kind: 'unknown' }
>;

/** What importing one TP page did, with the ids that identify the page. */
export type TpImportOutcome =
  | {
      kind: 'competition';
      tournamentSlug: string;
      result: TpLiveCompetitionImportResult;
    }
  | {
      kind: 'match';
      tournamentSlug: string;
      matchId: number;
      result: TpLiveMatchImportResult;
    }
  | { kind: 'roster'; rosterId: number; result: TpLiveTeamImportResult }
  | { kind: 'officialTeams'; result: TpLiveOfficialTeamsImportResult };

/** Options for {@link TpImportDispatchService.dispatch}. */
export interface DispatchTpImportOptions {
  page: ImportableTpPage;
  /**
   * The era to import under. Omitted, each import resolves it itself. The
   * official team list has no era and ignores it.
   */
  era?: string;
}

/**
 * Imports one classified TP page through the matching
 * packages/import-tp-live entry point, in-process, under the configured TP
 * external system name. Independent of Discord, so anything that learns of a
 * TP page (a slash command, feed monitoring) imports it the same way. Every
 * entry point reports failures in its result rather than throwing, and this
 * passes them through untouched.
 */
@Injectable()
export class TpImportDispatchService {
  constructor(
    private readonly config: DiscordBotConfigService,
    private readonly competitionImport: TpLiveCompetitionImportService,
    private readonly matchImport: TpLiveMatchImportService,
    private readonly teamImport: TpLiveTeamImportService,
    private readonly officialTeamsImport: TpLiveOfficialTeamsImportService,
  ) {}

  async dispatch({
    page,
    era,
  }: DispatchTpImportOptions): Promise<TpImportOutcome> {
    const externalSystemName = this.config.getTpExternalSystemName();
    switch (page.kind) {
      case 'competition':
        return {
          kind: 'competition',
          tournamentSlug: page.tournamentSlug,
          result: await this.competitionImport.importCompetition({
            tournamentSlug: page.tournamentSlug,
            era,
            externalSystemName,
          }),
        };
      case 'match':
        return {
          kind: 'match',
          tournamentSlug: page.tournamentSlug,
          matchId: page.matchId,
          result: await this.matchImport.importMatch({
            matchId: page.matchId,
            tournamentSlug: page.tournamentSlug,
            era,
            externalSystemName,
          }),
        };
      case 'roster':
        return {
          kind: 'roster',
          rosterId: page.rosterId,
          result: await this.teamImport.importTeam({
            rosterId: page.rosterId,
            era,
            externalSystemName,
          }),
        };
      case 'officialTeams':
        return {
          kind: 'officialTeams',
          result: await this.officialTeamsImport.importOfficialTeams({
            externalSystemName,
          }),
        };
    }
  }
}
