import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';

/** Shape of the parts of the TP phases response this service traverses. */
type TpPhase = {
  rounds: { groups: { matches: { matchId: string }[] }[] }[];
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
    const matchListResponse = this.findResponse(
      'phases?type=COACH',
      fixturesPageResult,
    ) as Record<string, TpPhase>;
    for (const phase of Object.values(matchListResponse)) {
      for (const round of phase.rounds) {
        for (const group of round.groups) {
          for (const match of group.matches) {
            await this.pageViewerService.viewPage({
              pageUrl: tournamentUrl + '/match/' + match.matchId,
              dirName,
            });
          }
        }
      }
    }
  }

  private async downloadParticipants(
    participantsPageResult: Map<string, unknown>,
    frontendUrl: string,
    dirName: string,
  ): Promise<void> {
    const participantsListResponse = this.findResponse(
      'inscriptions',
      participantsPageResult,
    ) as Record<string, TpInscription[]>;
    for (const inscriptions of Object.values(participantsListResponse)) {
      for (const inscription of inscriptions) {
        await this.pageViewerService.viewPage({
          pageUrl: frontendUrl + 'roster/' + inscription.roster.id,
          dirName,
        });
      }
    }
  }

  private findResponse(
    urlSuffix: string,
    pageResult: Map<string, unknown>,
  ): unknown {
    let foundResponse: unknown;
    pageResult.forEach((response, requestUrl) => {
      if (requestUrl.endsWith(urlSuffix)) {
        foundResponse = response;
      }
    });
    if (foundResponse) {
      return foundResponse;
    }
    throw new Error(
      `Did not find expected response with URL suffix ${urlSuffix}`,
    );
  }
}
