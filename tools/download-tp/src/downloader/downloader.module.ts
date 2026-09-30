import { ScrapeTpModule } from '@blood-bowl-tracker/scrape-tp';
import { TpPathsModule } from '@blood-bowl-tracker/tp-paths';
import { Module } from '@nestjs/common';

import { ApiResponseRecordingPageViewerService } from './api-response-recording-page-viewer.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { BrowserLeaguesDownloaderService } from './browser-leagues-downloader.service';
import { BrowserOfficialTeamsDownloaderService } from './browser-official-teams-downloader.service';
import { FileSystemService } from './file-system.service';
import { HttpLeaguesDownloaderService } from './http-leagues-downloader.service';
import { HttpOfficialTeamsDownloaderService } from './http-official-teams-downloader.service';
import { TpApiPathsService } from './tp-api-paths.service';

@Module({
  imports: [ScrapeTpModule, TpPathsModule],
  providers: [
    HttpLeaguesDownloaderService,
    HttpOfficialTeamsDownloaderService,
    BrowserLeaguesDownloaderService,
    BrowserOfficialTeamsDownloaderService,
    ApiResponseRecordingPageViewerService,
    ApiResponseStoringPageViewerService,
    ApiResponseStoringService,
    TpApiPathsService,
    FileSystemService,
  ],
  exports: [HttpLeaguesDownloaderService, HttpOfficialTeamsDownloaderService],
})
export class DownloaderModule {}
