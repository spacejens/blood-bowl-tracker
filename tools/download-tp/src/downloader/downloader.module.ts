import { ScrapeTpModule } from '@blood-bowl-tracker/scrape-tp';
import { Module } from '@nestjs/common';

import { ApiResponseRecordingPageViewerService } from './api-response-recording-page-viewer.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';
import { LeaguesDownloaderService } from './leagues-downloader.service';
import { OfficialTeamsDownloaderService } from './official-teams-downloader.service';
import { TpApiPathsService } from './tp-api-paths.service';

@Module({
  imports: [ScrapeTpModule],
  providers: [
    LeaguesDownloaderService,
    OfficialTeamsDownloaderService,
    ApiResponseRecordingPageViewerService,
    ApiResponseStoringPageViewerService,
    ApiResponseStoringService,
    TpApiPathsService,
    FileSystemService,
  ],
  exports: [LeaguesDownloaderService, OfficialTeamsDownloaderService],
})
export class DownloaderModule {}
