#!/usr/bin/env node

import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { DownloadTpConfigService } from './config/download-tp-config.service';
import { LeaguesDownloaderService } from './downloader/leagues-downloader.service';
import { OfficialTeamsDownloaderService } from './downloader/official-teams-downloader.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  // The official team list is per rules set, not per competition, so it runs
  // alongside the per-tournament scrape rather than instead of it. An empty
  // download.tournaments skips the (lengthy) per-tournament scrape entirely,
  // which is how a developer downloads only the official data.
  await app.get(OfficialTeamsDownloaderService).downloadOfficialTeams();
  if (app.get(DownloadTpConfigService).getTournaments().length > 0) {
    await app.get(LeaguesDownloaderService).downloadAllLeagues();
  }
}

bootstrap().catch((error: unknown) => {
  // A block ends the run like any other error; a stack trace would only
  // bury the one thing worth knowing: when TP may be tried again.
  if (error instanceof TpBlockedError) {
    console.error(
      `download-tp stopped: TP is blocking requests (HTTP 403 Access denied). Files already written are kept; TP may next be tried after ${error.retryAt.toISOString()}.`,
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
