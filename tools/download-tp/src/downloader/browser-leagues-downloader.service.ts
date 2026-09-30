import {
  TpMatchPathsService,
  TpRosterPathsService,
  TpTournamentPathsService,
} from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import type { ApiResponseStoringPageViewerOptions } from './api-response-storing-page-viewer.service';
import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';

/**
 * Shape of the parts of a TP phases response this service traverses. The live
 * API returns one response per phase, each flat: its matches are directly on
 * `matches` (carrying their own `group`), not nested under `rounds[].groups[]`
 * as an older single-response API did.
 */
type TpPhase = {
  currentRound?: number;
  rounds?: { roundNumber: number }[];
  matches?: { matchId: number | string }[];
};

/** Shape of the parts of a TP inscriptions response this service traverses. */
type TpInscription = { roster: { id: number | string } };

/** What every page visit of one tournament's crawl shares. */
type BrowserLeagueCrawl = {
  slug: string;
  dirName: string;
  frontendUrl: string;
};

/** What a page visit may add beyond its URL and output folder. */
type PageInteractions = Pick<
  ApiResponseStoringPageViewerOptions,
  'clickableElements' | 'followUpRequests'
>;

/**
 * The honours page's view toggles. Clicking each one makes the page request
 * that view's stats, so every view's response is recorded.
 */
const HONOURS_TOGGLES = [
  { selector: '.mat-button-toggle-button', textContent: 'Team' },
  { selector: '.mat-button-toggle-button', textContent: 'Player' },
  { selector: '.mat-button-toggle-button', textContent: 'Coach' },
];

/**
 * Downloads each configured tournament by driving a real browser through its
 * frontend pages and storing every TP API response those pages make. Page
 * paths come from packages/tp-paths, shared with the plain-HTTP method, and
 * the files written are named the same way, so tools/import-tp reads either.
 */
@Injectable()
export class BrowserLeaguesDownloaderService {
  constructor(
    private readonly downloadTpConfigService: DownloadTpConfigService,
    private readonly pageViewerService: ApiResponseStoringPageViewerService,
    private readonly tpMatchPathsService: TpMatchPathsService,
    private readonly tpRosterPathsService: TpRosterPathsService,
    private readonly tpTournamentPathsService: TpTournamentPathsService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  async downloadAllLeagues(): Promise<void> {
    const frontendUrl = this.downloadTpConfigService.getFrontendUrl();
    for (const slug of this.downloadTpConfigService.getTournaments()) {
      const dirName = slug;
      this.fileSystemService.mkdir(dirName);
      await this.downloadLeague({ slug, dirName, frontendUrl });
    }
  }

  private async downloadLeague(crawl: BrowserLeagueCrawl): Promise<void> {
    await this.viewTournamentPage(crawl, 'news');
    const fixturesPageResult = await this.viewPage(
      crawl,
      this.tpTournamentPathsService.scoresFrontendPath(crawl.slug),
      {
        followUpRequests: (apiResponses) => this.missingRoundUrls(apiResponses),
      },
    );
    await this.downloadMatches(crawl, fixturesPageResult);
    await this.viewTournamentPage(crawl, 'classifications');
    await this.viewTournamentPage(crawl, 'honours', {
      clickableElements: HONOURS_TOGGLES,
    });
    await this.viewTournamentPage(crawl, 'statistics');
    const participantsPageResult = await this.viewTournamentPage(
      crawl,
      'players',
    );
    await this.downloadParticipants(crawl, participantsPageResult);
    await this.viewTournamentPage(crawl, 'awards');
  }

  private async downloadMatches(
    crawl: BrowserLeagueCrawl,
    fixturesPageResult: Map<string, unknown>,
  ): Promise<void> {
    const phases = this.findResponses(
      'phases',
      fixturesPageResult,
    ) as TpPhase[];
    if (phases.length === 0) {
      throw new Error(
        'Did not find any response with URL path ending in phases',
      );
    }
    for (const phase of phases) {
      for (const match of phase.matches ?? []) {
        await this.viewPage(
          crawl,
          this.tpMatchPathsService.frontendPath(crawl.slug, match.matchId),
        );
      }
    }
  }

  private async downloadParticipants(
    crawl: BrowserLeagueCrawl,
    participantsPageResult: Map<string, unknown>,
  ): Promise<void> {
    // The live API paginates participants per category, so there is one
    // response per category rather than one for the whole tournament. Each
    // one is still keyed by category id.
    const participantsListResponses = this.findResponses(
      'inscriptions',
      participantsPageResult,
    ) as Record<string, TpInscription[]>[];
    if (participantsListResponses.length === 0) {
      throw new Error(
        'Did not find any response with URL path ending in inscriptions',
      );
    }
    for (const participantsListResponse of participantsListResponses) {
      for (const inscriptions of Object.values(participantsListResponse)) {
        for (const inscription of inscriptions) {
          await this.viewPage(
            crawl,
            this.tpRosterPathsService.frontendPath(inscription.roster.id),
          );
        }
      }
    }
  }

  /** One of the tournament's own pages (e.g. `news`, `scores`). */
  private viewTournamentPage(
    crawl: BrowserLeagueCrawl,
    page: string,
    interactions: PageInteractions = {},
  ): Promise<Map<string, unknown>> {
    return this.viewPage(
      crawl,
      this.tpTournamentPathsService.frontendPath(crawl.slug, page),
      interactions,
    );
  }

  /** Any frontend page, by its path relative to the frontend URL. */
  private viewPage(
    crawl: BrowserLeagueCrawl,
    frontendPath: string,
    interactions: PageInteractions = {},
  ): Promise<Map<string, unknown>> {
    return this.pageViewerService.viewPage({
      pageUrl: crawl.frontendUrl + frontendPath,
      dirName: crawl.dirName,
      ...interactions,
    });
  }

  /**
   * Finds every response whose URL path — the part before any query string —
   * ends with the given suffix. Matching on the path is what makes this
   * robust against TP's per-phase/per-category pagination query parameters.
   */
  private findResponses(
    pathSuffix: string,
    pageResult: Map<string, unknown>,
  ): unknown[] {
    const foundResponses: unknown[] = [];
    pageResult.forEach((response, requestUrl) => {
      if (this.pathEndsWith(requestUrl, pathSuffix)) {
        foundResponses.push(response);
      }
    });
    return foundResponses;
  }

  private pathEndsWith(requestUrl: string, pathSuffix: string): boolean {
    return requestUrl.split('?')[0].endsWith(pathSuffix);
  }

  /**
   * A phase response only carries its own `currentRound`'s matches; the
   * frontend loads older rounds by clicking a round tab, which re-requests the
   * same URL with `&round=<n>` appended. Tab labels differ by phase category
   * ("Matchday N" for the main phase, "Day N" for qualifying and playoffs), so
   * matching tabs by text would be brittle -- the round numbers are already in
   * the first response's `rounds[]`, so each missing round is requested
   * directly instead. The extra responses land under the same URL path, so
   * `findResponses('phases', ...)` picks them up with no merging step.
   */
  private missingRoundUrls(apiResponses: Map<string, unknown>): string[] {
    const apiUrl = this.downloadTpConfigService.getBackendApiUrl();
    const urls: string[] = [];
    apiResponses.forEach((response, requestUrl) => {
      if (!this.pathEndsWith(requestUrl, 'phases')) {
        return;
      }
      const phase = response as TpPhase;
      for (const round of phase.rounds ?? []) {
        if (round.roundNumber !== phase.currentRound) {
          urls.push(`${apiUrl}${requestUrl}&round=${round.roundNumber}`);
        }
      }
    });
    return urls;
  }
}
