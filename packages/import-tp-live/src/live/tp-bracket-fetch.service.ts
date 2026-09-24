import type {
  ImportError,
  TpBracketMatch,
} from '@blood-bowl-tracker/api-contract';
import type {
  TpPhaseFixtures,
  TpTournament,
} from '@blood-bowl-tracker/parse-tp';
import {
  PhaseFixturesParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Inject, Injectable } from '@nestjs/common';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** A tournament and every match its phase fixture lists show. */
export interface TpBracket {
  tournament: TpTournament;
  /** Every match of every phase and round, for category classification. */
  matches: TpBracketMatch[];
  /** Every dated match's date, for the competition's type and date span. */
  playedDates: Date[];
}

/** Options for {@link TpBracketFetchService.fetchBracket}. */
export interface FetchBracketOptions {
  /** The tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /** Where a fetch or parse failure is recorded. */
  errors: ImportError[];
  /** The session to fetch through; a fresh one is started when omitted. */
  session?: TpFetchSession;
}

/** One phase's fetch within a bracket fetch. */
interface FetchPhaseOptions {
  session: TpFetchSession;
  phaseId: number;
  tournamentSlug: string;
  errors: ImportError[];
}

/** One request of a bracket fetch, and how to read its response. */
interface FetchParsedOptions<T> {
  session: TpFetchSession;
  path: string;
  /** What the request is for, as named in an error message. */
  what: string;
  parse: (content: unknown) => T;
  tournamentSlug: string;
  errors: ImportError[];
}

@Injectable()
export class TpBracketFetchService {
  constructor(
    @Inject(TP_CONNECTION_PROVIDER)
    private readonly connection: TpConnectionProvider,
    private readonly fetcher: TpFetcherService,
    private readonly tournamentPaths: TpTournamentPathsService,
    private readonly tournamentParser: TournamentParserService,
    private readonly phaseParser: PhaseFixturesParserService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Fetch a tournament and every round of every phase's fixture list, the
   * way TP's own scores page does: a phase response lists only its current
   * round, so each other round is requested by number. Each fixture becomes
   * a bracket match placed at its phase's order. Any request that fails or
   * does not parse records one ImportError and yields undefined: a partial
   * bracket could silently misclassify a playoff match.
   */
  async fetchBracket({
    tournamentSlug,
    errors,
    session,
  }: FetchBracketOptions): Promise<TpBracket | undefined> {
    const visit = session ?? this.fetcher.createSession();
    const tournament = await this.fetchParsed({
      session: visit,
      path: this.tournamentPaths.apiPath(tournamentSlug),
      what: `tournament ${tournamentSlug}`,
      parse: (content) => this.tournamentParser.parse(content),
      tournamentSlug,
      errors,
    });
    if (tournament === undefined) {
      return undefined;
    }
    const matches = new Map<number, TpBracketMatch>();
    const playedDates = new Map<number, Date>();
    for (const phase of tournament.phases) {
      const pages = await this.fetchPhase({
        session: visit,
        phaseId: phase.id,
        tournamentSlug,
        errors,
      });
      if (pages === undefined) {
        return undefined;
      }
      for (const fixture of pages.flatMap((page) => page.fixtures)) {
        matches.set(fixture.id, {
          id: fixture.id,
          phaseOrder: phase.order,
          round: fixture.round,
          homeTeamTpId: fixture.homeTeamTpId,
          awayTeamTpId: fixture.awayTeamTpId,
          winner: fixture.winner,
        });
        if (fixture.playedDate !== undefined) {
          playedDates.set(fixture.id, fixture.playedDate);
        }
      }
    }
    return {
      tournament,
      matches: [...matches.values()],
      playedDates: [...playedDates.values()],
    };
  }

  /** Every round's fixture list of one phase. */
  private async fetchPhase({
    session,
    phaseId,
    tournamentSlug,
    errors,
  }: FetchPhaseOptions): Promise<TpPhaseFixtures[] | undefined> {
    const parse = (content: unknown) => this.phaseParser.parse(content);
    const first = await this.fetchParsed({
      session,
      path: this.tournamentPaths.phaseApiPath(tournamentSlug, phaseId),
      what: `phase ${phaseId} of tournament ${tournamentSlug}`,
      parse,
      tournamentSlug,
      errors,
    });
    if (first === undefined) {
      return undefined;
    }
    const pages = [first];
    for (const round of first.roundNumbers) {
      if (round === first.currentRound) {
        continue;
      }
      const page = await this.fetchParsed({
        session,
        path: this.tournamentPaths.phaseRoundApiPath(
          tournamentSlug,
          phaseId,
          round,
        ),
        what: `round ${round} of phase ${phaseId} of tournament ${tournamentSlug}`,
        parse,
        tournamentSlug,
        errors,
      });
      if (page === undefined) {
        return undefined;
      }
      pages.push(page);
    }
    return pages;
  }

  private async fetchParsed<T>({
    session,
    path,
    what,
    parse,
    tournamentSlug,
    errors,
  }: FetchParsedOptions<T>): Promise<T | undefined> {
    const item = { tournamentSlug, path };
    let content: unknown;
    try {
      content = await session.fetch(this.connection.getBackendApiUrl() + path, {
        referer:
          this.connection.getFrontendUrl() +
          this.tournamentPaths.frontendPath(tournamentSlug, 'scores'),
      });
    } catch (error) {
      errors.push(
        this.importResults.error({
          item,
          message: `Could not fetch TP ${what}: ${this.runner.messageOf(error)}`,
        }),
      );
      return undefined;
    }
    try {
      return parse(content);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item,
          message: `Could not parse TP ${what}: ${this.runner.messageOf(error)}`,
        }),
      );
      return undefined;
    }
  }
}
