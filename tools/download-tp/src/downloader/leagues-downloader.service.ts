import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import type { TpRequest } from '@blood-bowl-tracker/tp-paths';
import {
  TpMatchPathsService,
  TpRosterPathsService,
  TpTournamentPathsService,
} from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';

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
   * TP's frontend makes for that page (see packages/tp-paths).
   */
  private async downloadLeague(crawl: LeagueCrawl): Promise<void> {
    const paths = this.tpTournamentPathsService;
    const urls = this.downloadTpConfigService;
    const { slug } = crawl;
    const tournament = (await this.fetch(
      crawl,
      paths.request(urls, slug, 'news'),
    )) as TpTournament;
    await this.fetch(crawl, paths.newsRequest(urls, slug));
    const phaseIds = this.phaseIds(tournament, slug);
    await this.downloadFixtures(crawl, phaseIds);
    for (const phaseId of phaseIds) {
      await this.fetch(
        crawl,
        paths.classificationsRequest(urls, slug, phaseId),
      );
    }
    await this.fetch(crawl, paths.teamStatsRequest(urls, slug));
    await this.fetch(crawl, paths.lineupStatsRequest(urls, slug));
    await this.fetch(crawl, paths.coachStatsRequest(urls, slug));
    await this.fetch(crawl, paths.statisticsRequest(urls, slug));
    await this.downloadParticipants(
      crawl,
      (tournament.categories ?? []).map((category) => category.id),
    );
    await this.fetch(crawl, paths.awardsRequest(urls, slug));
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
    const paths = this.tpTournamentPathsService;
    const urls = this.downloadTpConfigService;
    const phases: TpPhase[] = [];
    for (const phaseId of phaseIds) {
      const phase = (await this.fetch(
        crawl,
        paths.phaseRequest(urls, crawl.slug, phaseId),
      )) as TpPhase;
      phases.push(phase);
      for (const round of phase.rounds ?? []) {
        if (round.roundNumber !== phase.currentRound) {
          phases.push(
            (await this.fetch(
              crawl,
              paths.phaseRoundRequest(urls, crawl.slug, {
                phaseId,
                roundNumber: round.roundNumber,
              }),
            )) as TpPhase,
          );
        }
      }
    }
    for (const phase of phases) {
      for (const match of phase.matches ?? []) {
        await this.fetch(
          crawl,
          this.tpMatchPathsService.request(urls, crawl.slug, match.matchId),
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
    const urls = this.downloadTpConfigService;
    const responses: Record<string, TpInscription[]>[] = [];
    for (const categoryId of categoryIds) {
      responses.push(
        (await this.fetch(
          crawl,
          this.tpTournamentPathsService.inscriptionsRequest(
            urls,
            crawl.slug,
            categoryId,
          ),
        )) as Record<string, TpInscription[]>,
      );
    }
    for (const response of responses) {
      for (const inscriptions of Object.values(response)) {
        for (const inscription of inscriptions) {
          await this.fetch(
            crawl,
            this.tpRosterPathsService.request(urls, inscription.roster.id),
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

  private fetch(crawl: LeagueCrawl, request: TpRequest): Promise<unknown> {
    return this.apiResponseStoringService.fetchAndStore(
      crawl.session,
      request,
      crawl.dirName,
    );
  }
}
