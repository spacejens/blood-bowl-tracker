import type {
  TpLiveCompetitionImportResult,
  TpLiveMatchImportResult,
  TpLiveMatchTeamsImportResult,
  TpLiveOfficialTeamsImportResult,
  TpLiveTeamImportResult,
} from '@blood-bowl-tracker/import-tp-live';
import {
  TpLiveCompetitionImportService,
  TpLiveMatchImportService,
  TpLiveMatchTeamsImportService,
  TpLiveOfficialTeamsImportService,
  TpLiveTeamImportService,
} from '@blood-bowl-tracker/import-tp-live';
import type { TpPageClassification } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { DiscordBotConfigService } from '../discord-bot-config.service';

/** A classified TP page this bot knows how to import. */
export type ImportableTpPage = Exclude<
  TpPageClassification,
  { kind: 'unknown' }
>;

/**
 * What to import: a classified TP page, or — for a caller that knows a
 * match is only starting, such as the TP feed — just that match's two
 * teams, which a match page itself cannot express because importing a
 * match page imports the (completed) match.
 */
export type TpImportTarget =
  | ImportableTpPage
  | { kind: 'matchTeams'; tournamentSlug: string; matchId: number };

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
  | {
      kind: 'matchTeams';
      tournamentSlug: string;
      matchId: number;
      result: TpLiveMatchTeamsImportResult;
    }
  | { kind: 'roster'; rosterId: number; result: TpLiveTeamImportResult }
  | { kind: 'officialTeams'; result: TpLiveOfficialTeamsImportResult };

/** Options for {@link TpImportDispatchService.dispatch}. */
export interface DispatchTpImportOptions {
  page: TpImportTarget;
  /**
   * The era to import under. Omitted, each import resolves it itself. The
   * official team list has no era and ignores it.
   */
  era?: string;
  /**
   * Redo the competition backfill even though the competition already
   * exists: for a match page, the match import's backfill of the
   * competition; for a competition page, its match backfill. Other kinds of
   * page ignore it.
   */
  forceMatchBackfill?: boolean;
}

/**
 * Imports one classified TP page through the matching
 * packages/import-tp-live entry point, in-process, under the configured TP
 * external system name. Independent of Discord, so anything that learns of a
 * TP page (a slash command, feed monitoring) imports it the same way. Every
 * entry point reports failures in its result rather than throwing, and this
 * passes them through untouched.
 *
 * A competition's scores page imports that competition and forces every
 * completed match of it to be backfilled; a plain competition page backfills
 * matches only for a competition imported for the first time. A `matchTeams`
 * target imports only a match's two teams, whatever state the match is in.
 */
@Injectable()
export class TpImportDispatchService {
  constructor(
    private readonly config: DiscordBotConfigService,
    private readonly competitionImport: TpLiveCompetitionImportService,
    private readonly matchImport: TpLiveMatchImportService,
    private readonly matchTeamsImport: TpLiveMatchTeamsImportService,
    private readonly teamImport: TpLiveTeamImportService,
    private readonly officialTeamsImport: TpLiveOfficialTeamsImportService,
  ) {}

  async dispatch({
    page,
    era,
    forceMatchBackfill,
  }: DispatchTpImportOptions): Promise<TpImportOutcome> {
    const externalSystemName = this.config.getTpExternalSystemName();
    switch (page.kind) {
      case 'competition':
      case 'competitionScores':
        return {
          kind: 'competition',
          tournamentSlug: page.tournamentSlug,
          result: await this.competitionImport.importCompetition({
            tournamentSlug: page.tournamentSlug,
            era,
            externalSystemName,
            forceMatchBackfill:
              page.kind === 'competitionScores' || forceMatchBackfill === true,
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
            forceMatchBackfill,
          }),
        };
      case 'matchTeams':
        return {
          kind: 'matchTeams',
          tournamentSlug: page.tournamentSlug,
          matchId: page.matchId,
          result: await this.matchTeamsImport.importMatchTeams({
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
