import type {
  ImportError,
  TpBracketMatch,
} from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
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
import type { TpRequest } from '@blood-bowl-tracker/tp-paths';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { TpRequestFetchService } from './tp-request-fetch.service';

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
  request: TpRequest;
  /** What the request is for, as named in an error message (e.g. `TP tournament s30`). */
  what: string;
  parse: (content: unknown) => T;
  tournamentSlug: string;
  errors: ImportError[];
}

@Injectable()
export class TpBracketFetchService {
  constructor(
    private readonly requestFetch: TpRequestFetchService,
    private readonly fetcher: TpFetcherService,
    private readonly tournamentPaths: TpTournamentPathsService,
    private readonly tournamentParser: TournamentParserService,
    private readonly phaseParser: PhaseFixturesParserService,
    private readonly importResults: ImportResultService,
    private readonly runner: UpsertRecorderService,
  ) {}

  /**
   * Fetch a tournament and every round of every phase's fixture list, the
   * way TP's own scores page does: a phase response lists only its current
   * round, so each other round is requested by number. Each fixture becomes
   * a bracket match placed at its phase's order. Any request that fails or
   * does not parse records one ImportError and yields undefined: a partial
   * bracket could silently misclassify a playoff match. A TP block
   * (`TpBlockedError`) is rethrown instead, so the whole import stops rather
   * than carrying on against a TP that refuses every request.
   */
  async fetchBracket({
    tournamentSlug,
    errors,
    session,
  }: FetchBracketOptions): Promise<TpBracket | undefined> {
    const visit = session ?? this.fetcher.createSession();
    const tournament = await this.fetchParsed({
      session: visit,
      request: this.tournamentPaths.request(
        this.requestFetch.baseUrls(),
        tournamentSlug,
        'scores',
      ),
      what: `TP tournament ${tournamentSlug}`,
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
    const baseUrls = this.requestFetch.baseUrls();
    const parse = (content: unknown) => this.phaseParser.parse(content);
    const first = await this.fetchParsed({
      session,
      request: this.tournamentPaths.phaseRequest(
        baseUrls,
        tournamentSlug,
        phaseId,
      ),
      what: `TP phase ${phaseId} of tournament ${tournamentSlug}`,
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
        request: this.tournamentPaths.phaseRoundRequest(
          baseUrls,
          tournamentSlug,
          { phaseId, roundNumber: round },
        ),
        what: `TP round ${round} of phase ${phaseId} of tournament ${tournamentSlug}`,
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
    request,
    what,
    parse,
    tournamentSlug,
    errors,
  }: FetchParsedOptions<T>): Promise<T | undefined> {
    const item = { tournamentSlug, path: request.path };
    const fetched = await this.requestFetch.fetch({
      request,
      what,
      item,
      errors,
      session,
    });
    if (fetched === undefined) {
      return undefined;
    }
    try {
      return parse(fetched.content);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item,
          message: `Could not parse ${what}: ${this.runner.messageOf(error)}`,
        }),
      );
      return undefined;
    }
  }
}
