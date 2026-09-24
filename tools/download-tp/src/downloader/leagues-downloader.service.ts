import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import {
  TpMatchPathsService,
  TpRosterPathsService,
  TpTournamentPathsService,
} from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';
import { TpApiPathsService } from './tp-api-paths.service';

/** Shape of the parts of TP's tournament response this service traverses. */
type TpTournament = {
  categories?: { id: number; phases?: { id: number }[] }[];
};

/**
 * Shape of the parts of a TP phases response this service traverses. The
 * live API returns one response per phase, each flat: its matches are
 * directly on `matches` (carrying their own `group`), not nested under
 * `rounds[].groups[]` as an older single-response API did.
 */
type TpPhase = {
  currentRound?: number;
  rounds?: { roundNumber: number }[];
  matches?: { matchId: number | string }[];
};

/** Shape of the parts of a TP inscriptions response this service traverses. */
type TpInscription = { roster: { id: number | string } };

/** What every request of one tournament's crawl shares. */
type LeagueCrawl = {
  session: TpFetchSession;
  slug: string;
  dirName: string;
};

@Injectable()
export class LeaguesDownloaderService {
  constructor(
    private readonly downloadTpConfigService: DownloadTpConfigService,
    private readonly tpFetcherService: TpFetcherService,
    private readonly apiResponseStoringService: ApiResponseStoringService,
    private readonly tpApiPathsService: TpApiPathsService,
    private readonly tpMatchPathsService: TpMatchPathsService,
    private readonly tpRosterPathsService: TpRosterPathsService,
    private readonly tpTournamentPathsService: TpTournamentPathsService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  async downloadAllLeagues(): Promise<void> {
    for (const slug of this.downloadTpConfigService.getTournaments()) {
      const dirName = slug;
      this.fileSystemService.mkdir(dirName);
      await this.downloadLeague({
        session: this.tpFetcherService.createSession(),
        slug,
        dirName,
      });
    }
  }

  /**
   * One tournament's whole crawl, through one session so pacing and cookies
   * carry across every page as one continuous visit. Pages are covered in
   * the order a browser-based crawl visited them, each with the API requests
   * TP's frontend makes for that page (see TpApiPathsService).
   */
  private async downloadLeague(crawl: LeagueCrawl): Promise<void> {
    const paths = this.tpApiPathsService;
    const { slug } = crawl;
    const newsPage = this.tournamentPage(crawl, 'news');
    const tournament = (await this.fetch(
      crawl,
      this.tpTournamentPathsService.apiPath(slug),
      newsPage,
    )) as TpTournament;
    await this.fetch(crawl, paths.news(slug), newsPage);
    const phaseIds = this.phaseIds(tournament, slug);
    await this.downloadFixtures(crawl, phaseIds);
    const classificationsPage = this.tournamentPage(crawl, 'classifications');
    for (const phaseId of phaseIds) {
      await this.fetch(
        crawl,
        paths.classifications(slug, phaseId),
        classificationsPage,
      );
    }
    const honoursPage = this.tournamentPage(crawl, 'honours');
    await this.fetch(crawl, paths.teamStats(slug), honoursPage);
    await this.fetch(crawl, paths.lineupStats(slug), honoursPage);
    await this.fetch(crawl, paths.coachStats(slug), honoursPage);
    await this.fetch(
      crawl,
      paths.statistics(slug),
      this.tournamentPage(crawl, 'statistics'),
    );
    await this.downloadParticipants(
      crawl,
      (tournament.categories ?? []).map((category) => category.id),
    );
    await this.fetch(
      crawl,
      this.tpTournamentPathsService.awardsApiPath(slug),
      this.tournamentPage(crawl, 'awards'),
    );
  }

  /**
   * Every phase's fixtures, then every match they list. A phase response
   * only carries its own `currentRound`'s matches; the frontend loads older
   * rounds by clicking a round tab, which re-requests the same URL with
   * `&round=<n>` appended. The round numbers are already in the first
   * response's `rounds[]`, so each other round is requested directly.
   */
  private async downloadFixtures(
    crawl: LeagueCrawl,
    phaseIds: number[],
  ): Promise<void> {
    const scoresPage = this.tournamentPage(crawl, 'scores');
    const phases: TpPhase[] = [];
    for (const phaseId of phaseIds) {
      const phase = (await this.fetch(
        crawl,
        this.tpTournamentPathsService.phaseApiPath(crawl.slug, phaseId),
        scoresPage,
      )) as TpPhase;
      phases.push(phase);
      for (const round of phase.rounds ?? []) {
        if (round.roundNumber !== phase.currentRound) {
          phases.push(
            (await this.fetch(
              crawl,
              this.tpTournamentPathsService.phaseRoundApiPath(
                crawl.slug,
                phaseId,
                round.roundNumber,
              ),
              scoresPage,
            )) as TpPhase,
          );
        }
      }
    }
    for (const phase of phases) {
      for (const match of phase.matches ?? []) {
        await this.fetch(
          crawl,
          this.tpMatchPathsService.apiPath(match.matchId),
          `${this.downloadTpConfigService.getFrontendUrl()}${this.tpMatchPathsService.frontendPath(crawl.slug, match.matchId)}`,
        );
      }
    }
  }

  /**
   * Every category's participant list, then every roster they list. The
   * live API paginates participants per category; each response is keyed by
   * category id.
   */
  private async downloadParticipants(
    crawl: LeagueCrawl,
    categoryIds: number[],
  ): Promise<void> {
    const playersPage = this.tournamentPage(crawl, 'players');
    const responses: Record<string, TpInscription[]>[] = [];
    for (const categoryId of categoryIds) {
      responses.push(
        (await this.fetch(
          crawl,
          this.tpTournamentPathsService.inscriptionsApiPath(
            crawl.slug,
            categoryId,
          ),
          playersPage,
        )) as Record<string, TpInscription[]>,
      );
    }
    const frontendUrl = this.downloadTpConfigService.getFrontendUrl();
    for (const response of responses) {
      for (const inscriptions of Object.values(response)) {
        for (const inscription of inscriptions) {
          await this.fetch(
            crawl,
            this.tpRosterPathsService.apiPath(inscription.roster.id),
            `${frontendUrl}${this.tpRosterPathsService.frontendPath(inscription.roster.id)}`,
          );
        }
      }
    }
  }

  /** Every phase id across the tournament's categories, in listed order. */
  private phaseIds(tournament: TpTournament, slug: string): number[] {
    const phaseIds = (tournament.categories ?? []).flatMap((category) =>
      (category.phases ?? []).map((phase) => phase.id),
    );
    if (phaseIds.length === 0) {
      throw new Error(`Tournament ${slug} lists no phases in its categories`);
    }
    return phaseIds;
  }

  /** A page under the tournament's frontend URL, used as a referer. */
  private tournamentPage(crawl: LeagueCrawl, page: string): string {
    return `${this.downloadTpConfigService.getFrontendUrl()}${this.tpTournamentPathsService.frontendPath(crawl.slug, page)}`;
  }

  private fetch(
    crawl: LeagueCrawl,
    path: string,
    referer: string,
  ): Promise<unknown> {
    return this.apiResponseStoringService.fetchAndStore(crawl.session, {
      path,
      referer,
      dirName: crawl.dirName,
    });
  }
}
