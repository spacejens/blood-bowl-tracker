import type {
  ImportError,
  ImportResult,
  TpBracketMatch,
  TpMatchImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { MatchParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpMatchEventsUpsertService } from './events/tp-match-events-upsert.service';
import { TpMatchContextService } from './tp-match-context.service';
import { TpMatchOutcomeService } from './tp-match-outcome.service';
import { TpMatchUpsertService } from './tp-match-upsert.service';

/** Options for {@link TpMatchImportService.importMatch}. */
export interface ImportMatchOptions {
  match: TpMatch;
  /** Every match in the match's competition, the match itself included. */
  bracket: TpBracketMatch[];
  /** TP's id of the match's competition, which must already be imported. */
  competitionTpId: number;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
}

/** Options for {@link TpMatchImportService.importRawMatch}. */
export interface ImportRawMatchOptions extends Omit<
  ImportMatchOptions,
  'match'
> {
  /** One TP match exactly as TP's API returns it. */
  content: unknown;
}

/**
 * Imports one TP match straight into the database: the shared core of the
 * live import (TpLiveMatchImportService) and the `tpMatches.import`
 * procedure tools/import-tp's bulk run calls once per match file. The
 * match's competition and both teams must already be imported. Every
 * failure is reported in the returned results rather than thrown, except an
 * unexpected database error, which propagates to the caller.
 */
@Injectable()
export class TpMatchImportService {
  constructor(
    private readonly matchParser: MatchParserService,
    private readonly context: TpMatchContextService,
    private readonly matchUpsert: TpMatchUpsertService,
    private readonly eventsUpsert: TpMatchEventsUpsertService,
    private readonly outcome: TpMatchOutcomeService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /** {@link importMatch}, for match JSON not parsed yet. */
  async importRawMatch({
    content,
    ...options
  }: ImportRawMatchOptions): Promise<TpMatchImportResult> {
    let match: TpMatch;
    try {
      match = this.matchParser.parse(content);
    } catch (error) {
      return this.notImported([
        this.importResults.error({
          item: { competition: options.competitionTpId },
          message: `Could not parse TP match: ${this.runner.messageOf(error)}`,
        }),
      ]);
    }
    return this.importMatch({ match, ...options });
  }

  /**
   * Resolves the match's context, upserts the match, links its teams, then
   * imports its events and resolves its outcome. A stage whose prerequisite
   * failed is not attempted and reports nothing imported: nothing is
   * imported without a context or a match row, and events and outcome need
   * the match's teams linked.
   */
  async importMatch({
    match,
    bracket,
    competitionTpId,
    externalSystemName,
  }: ImportMatchOptions): Promise<TpMatchImportResult> {
    const matchErrors: ImportError[] = [];
    const context = await this.context.resolve({
      match,
      competitionTpId,
      externalSystemName,
      errors: matchErrors,
    });
    if (context === undefined) {
      return this.notImported(matchErrors);
    }
    const matchId = await this.matchUpsert.upsertMatch({
      match,
      bracket,
      context,
      errors: matchErrors,
    });
    if (matchId === undefined) {
      return this.notImported(matchErrors);
    }
    const matchResult = this.importResults.result({
      imported: 1,
      errors: matchErrors,
    });

    const participationErrors: ImportError[] = [];
    const linked = await this.matchUpsert.syncParticipation({
      match,
      context,
      errors: participationErrors,
    });
    const participation = this.importResults.result({
      imported: linked ? 1 : 0,
      errors: participationErrors,
    });
    if (!linked) {
      return {
        match: matchResult,
        participation,
        events: this.nothing(),
        outcome: this.nothing(),
      };
    }

    const eventErrors: ImportError[] = [];
    const eventsImported = await this.eventsUpsert.upsertEvents({
      match,
      matchId,
      context,
      errors: eventErrors,
    });
    const outcomeErrors: ImportError[] = [];
    const resolved = await this.outcome.resolveOutcome({
      match,
      matchId,
      context,
      errors: outcomeErrors,
    });
    return {
      match: matchResult,
      participation,
      events: this.importResults.result({
        imported: eventsImported,
        errors: eventErrors,
      }),
      outcome: this.importResults.result({
        imported: resolved ? 1 : 0,
        errors: outcomeErrors,
      }),
    };
  }

  private notImported(matchErrors: ImportError[]): TpMatchImportResult {
    return {
      match: this.importResults.result({ imported: 0, errors: matchErrors }),
      participation: this.nothing(),
      events: this.nothing(),
      outcome: this.nothing(),
    };
  }

  private nothing(): ImportResult {
    return this.importResults.result({ imported: 0, errors: [] });
  }
}
