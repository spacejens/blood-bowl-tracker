import { Module } from '@nestjs/common';

import { ApiResponseRecordingPageViewerService } from './api-response-recording-page-viewer.service';
import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';
import { LeaguesDownloaderService } from './leagues-downloader.service';
import { OfficialTeamsDownloaderService } from './official-teams-downloader.service';

@Module({
  providers: [
    LeaguesDownloaderService,
    OfficialTeamsDownloaderService,
    ApiResponseRecordingPageViewerService,
    ApiResponseStoringPageViewerService,
    FileSystemService,
  ],
  exports: [LeaguesDownloaderService, OfficialTeamsDownloaderService],
})
export class DownloaderModule {}
