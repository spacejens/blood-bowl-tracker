import { ScrapeTpModule } from '@blood-bowl-tracker/scrape-tp';
import { TpPathsModule } from '@blood-bowl-tracker/tp-paths';
import { Module } from '@nestjs/common';

import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';
import { LeaguesDownloaderService } from './leagues-downloader.service';
import { OfficialTeamsDownloaderService } from './official-teams-downloader.service';
import { TpApiPathsService } from './tp-api-paths.service';

@Module({
  imports: [ScrapeTpModule, TpPathsModule],
  providers: [
    LeaguesDownloaderService,
    OfficialTeamsDownloaderService,
    ApiResponseStoringService,
    TpApiPathsService,
    FileSystemService,
  ],
  exports: [LeaguesDownloaderService, OfficialTeamsDownloaderService],
})
export class DownloaderModule {}
