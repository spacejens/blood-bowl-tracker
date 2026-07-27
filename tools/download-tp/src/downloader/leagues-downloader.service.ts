import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  matches?: { matchId: string }[];
};

/** Shape of the parts of the TP inscriptions response this service traverses. */
type TpInscription = { roster: { id: string } };

@Injectable()
export class LeaguesDownloaderService {
  constructor(
    private readonly configService: ConfigService,
    private readonly pageViewerService: ApiResponseStoringPageViewerService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  async downloadAllLeagues(): Promise<void> {
    const frontendUrl =
      this.configService.getOrThrow<string>('TP_FRONTEND_URL');
    const tournaments = this.configService.getOrThrow<string>('TOURNAMENTS');
    for (const tournamentName of tournaments.split(',')) {
      const dirName = tournamentName;
      this.fileSystemService.mkdir(dirName);
      await this.downloadLeague(
        frontendUrl + tournamentName,
        frontendUrl,
        dirName,
      );
    }
  }

  private async downloadLeague(
    tournamentUrl: string,
    frontendUrl: string,
    dirName: string,
  ): Promise<void> {
    await this.pageViewerService.viewPage({
      pageUrl: tournamentUrl + '/news',
      dirName,
    });
    const fixturesPageResult = await this.pageViewerService.viewPage({
      pageUrl: tournamentUrl + '/scores',
      dirName,
      followUpRequests: (apiResponses) => this.missingRoundUrls(apiResponses),
    });
    await this.downloadMatches(fixturesPageResult, tournamentUrl, dirName);
    await this.pageViewerService.viewPage({
      pageUrl: tournamentUrl + '/classifications',
      dirName,
    });
    await this.pageViewerService.viewPage({
      pageUrl: tournamentUrl + '/honours',
      dirName,
      clickableElements: [
        { selector: '.mat-button-toggle-button', textContent: 'Team' },
        { selector: '.mat-button-toggle-button', textContent: 'Player' },
        { selector: '.mat-button-toggle-button', textContent: 'Coach' },
      ],
    });
    await this.pageViewerService.viewPage({
      pageUrl: tournamentUrl + '/statistics',
      dirName,
    });
    const participantsPageResult = await this.pageViewerService.viewPage({
      pageUrl: tournamentUrl + '/players',
      dirName,
    });
    await this.downloadParticipants(
      participantsPageResult,
      frontendUrl,
      dirName,
    );
    await this.pageViewerService.viewPage({
      pageUrl: tournamentUrl + '/awards',
      dirName,
    });
  }

  private async downloadMatches(
    fixturesPageResult: Map<string, unknown>,
    tournamentUrl: string,
    dirName: string,
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
        await this.pageViewerService.viewPage({
          pageUrl: tournamentUrl + '/match/' + match.matchId,
          dirName,
        });
      }
    }
  }

  private async downloadParticipants(
    participantsPageResult: Map<string, unknown>,
    frontendUrl: string,
    dirName: string,
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
          await this.pageViewerService.viewPage({
            pageUrl: frontendUrl + 'roster/' + inscription.roster.id,
            dirName,
          });
        }
      }
    }
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
    const apiUrl = this.configService.getOrThrow<string>('TP_BACKEND_API_URL');
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
